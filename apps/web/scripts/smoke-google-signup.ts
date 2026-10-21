/**
 * Google sign-up provisioning on Neon: an invited email joins the inviting workspace with the
 * invited role (and the invite is used up); a new email gets its own workspace as Owner.
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
  const editor = ws.roles.find((r) => r.slug === "editor")!;
  const userIds: string[] = [];
  let ownWs: string | null = null;
  try {
    await prisma.invitation.create({
      data: { workspaceId: ws.id, email: invitedEmail, roleId: editor.id, tokenHash: hashToken(`t-${stamp}`), expiresAt: new Date(Date.now() + 86_400_000) },
    });
    const invited = await prisma.user.create({ data: { email: invitedEmail, name: "Invited Person" } });
    userIds.push(invited.id);
    const r1 = await provisionGoogleUser(invited);
    assert.equal(r1.joined, 1);
    const perms = await effectivePermissions(ws.id, invited.id);
    assert.ok(perms.has("content.create") && !perms.has("members.manage"));
    assert.equal(await prisma.workspaceMember.count({ where: { userId: invited.id } }), 1, "no personal workspace when invited");
    const inv = await prisma.invitation.findFirstOrThrow({ where: { email: invitedEmail } });
    assert.ok(inv.acceptedAt, "invitation used up");
    console.log("1 invited email → joins the inviting workspace as Designer / editor, invite used ✓");

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
    if (ownWs) await prisma.workspace.delete({ where: { id: ownWs } });
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
