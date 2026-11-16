/**
 * Google sign-up provisioning on Neon: an email invited to a project joins that workspace as
 * Member with the project role (invite used up) and still gets a workspace of its own;
 * a new email gets its own workspace as Owner.
 * Run: npm run smoke:google -w web
 */
import assert from "node:assert/strict";
import { prisma } from "@/server/db/prisma";
import { hashToken } from "@/server/auth/tokens";
import { effectivePermissions } from "@/server/auth/permissions";
import { provisionGoogleUser } from "@/server/services/google-signup";

async function main() {
  const stamp = Date.now();
  const invitedEmail = `smoke-g-invited-${stamp}@example.com`;
  const newEmail = `smoke-g-new-${stamp}@example.com`;
  const ws = await prisma.workspace.findFirstOrThrow({ include: { roles: true } });
  const creator = ws.roles.find((r) => r.slug === "creator")!;
  const brand = await prisma.brand.findFirstOrThrow({ where: { workspaceId: ws.id } });
  const userIds: string[] = [];
  const ownWss: string[] = [];
  let ownWs: string | null = null;
  try {
    await prisma.invitation.create({
      data: { workspaceId: ws.id, brandId: brand.id, email: invitedEmail, roleId: creator.id, tokenHash: hashToken(`t-${stamp}`), expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const invited = await prisma.user.create({ data: { email: invitedEmail, name: "Invited Person" } });
    userIds.push(invited.id);
    const r1 = await provisionGoogleUser(invited);
    assert.equal(r1.joined, 1);
    if (r1.workspaceId) ownWss.push(r1.workspaceId);
    const perms = await effectivePermissions(ws.id, invited.id, brand.id);
    assert.ok(perms.has("content.create") && !perms.has("members.manage"));
    assert.ok(!(await effectivePermissions(ws.id, invited.id)).has("brand.read"), "no workspace-wide project access");
    assert.ok(r1.workspaceId, "invited people get their own workspace too");
    const inv = await prisma.invitation.findFirstOrThrow({ where: { email: invitedEmail } });
    assert.ok(inv.acceptedAt, "invitation used up");
    console.log("1 project invite → Creator on that project only, invite used, own workspace too ✓");

    const fresh = await prisma.user.create({ data: { email: newEmail, name: "Ana Martin" } });
    userIds.push(fresh.id);
    const r2 = await provisionGoogleUser(fresh);
    ownWs = r2.workspaceId;
    assert.ok(ownWs);
    const w = await prisma.workspace.findUniqueOrThrow({ where: { id: ownWs } });
    assert.equal(w.name, "Ana's workspace");
    const p2 = await effectivePermissions(ownWs, fresh.id);
    assert.ok(p2.has("workspace.manage") && p2.has("brand.create"));
    console.log("2 new email → own workspace \"Ana's workspace\" as Owner (can add a brand) ✓");
  } finally {
    await prisma.invitation.deleteMany({ where: { email: invitedEmail } });
    for (const id of [...ownWss, ownWs].filter(Boolean) as string[]) await prisma.workspace.delete({ where: { id } });
    await prisma.brandMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.workspaceMember.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorUserId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
