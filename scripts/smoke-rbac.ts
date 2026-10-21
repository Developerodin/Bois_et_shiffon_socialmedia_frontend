/**
 * Live RBAC + account-flow check on Neon (services, no server needed):
 * invite → preview → accept (single use) → member gets role permissions →
 * custom role → role change → last-owner guard → password reset (single use,
 * revokes sessions). Cleans up. Run: npm run smoke:rbac -w web
 */
import assert from "node:assert/strict";
import { prisma } from "@/server/db/prisma";
import { effectivePermissions } from "@/server/auth/permissions";
import { hashToken } from "@/server/auth/tokens";
import {
  acceptInvitation,
  AccountFlowError,
  createInvitation,
  previewInvitation,
  requestPasswordReset,
  resetPassword,
} from "@/server/services/accounts";
import { changeMemberRole, createRole, deleteRole, listMembers, removeMember } from "@/server/services/workspace-admin";

async function main() {
  const ws = await prisma.workspace.findFirstOrThrow({ include: { roles: true } });
  const owner = (await listMembers(ws.id)).find((m) => m.role?.slug === "owner")!;
  const editorRole = ws.roles.find((r) => r.slug === "editor")!;
  const email = `smoke-rbac-${Date.now()}@example.com`;
  let customRoleId: string | null = null;

  try {
    // 1. invite + accept
    const { inviteUrl, emailDelivery } = await createInvitation({ workspaceId: ws.id, email, roleId: editorRole.id, invitedByUserId: owner.userId });
    const token = inviteUrl.split("/invite/")[1];
    const preview = await previewInvitation(token);
    assert.equal(preview.roleName, editorRole.name);
    await assert.rejects(acceptInvitation({ token, name: "Smoke", password: "short" }), AccountFlowError);
    await acceptInvitation({ token, name: "Smoke", password: "a-long-enough-password" });
    await assert.rejects(acceptInvitation({ token, password: "a-long-enough-password" }), AccountFlowError);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    console.log(`1 invite → accept (single use, weak password rejected), email: ${emailDelivery} ✓`);

    // 2. permissions follow the role
    let perms = await effectivePermissions(ws.id, user.id);
    assert.ok(perms.has("content.create") && !perms.has("agents.run") && !perms.has("members.manage"));
    console.log("2 editor gets content.create, not agents.run / members.manage ✓");

    // 3. custom role + role change takes effect immediately
    const custom = await createRole(ws.id, owner.userId, { name: `Smoke runner ${Date.now()}`, permissions: ["brand.read", "agents.read", "agents.run"] });
    customRoleId = custom.id;
    const member = (await listMembers(ws.id)).find((m) => m.userId === user.id)!;
    await changeMemberRole(ws.id, owner.userId, member.id, custom.id);
    perms = await effectivePermissions(ws.id, user.id);
    assert.ok(perms.has("agents.run") && !perms.has("content.create"));
    console.log("3 custom role assigned → permissions change immediately ✓");

    // 4. ownership guards
    await assert.rejects(changeMemberRole(ws.id, user.id, member.id, ws.roles.find((r) => r.slug === "owner")!.id), AccountFlowError);
    const owners = (await listMembers(ws.id)).filter((m) => m.role?.slug === "owner");
    if (owners.length === 1) {
      await assert.rejects(removeMember(ws.id, owner.userId, owners[0].id), AccountFlowError);
    }
    await assert.rejects(deleteRole(ws.id, owner.userId, custom.id), AccountFlowError); // still assigned
    console.log("4 non-owner can't grant owner; last owner protected; assigned role can't be deleted ✓");

    // 5. password reset: single use + revokes sessions
    const before = user.sessionVersion;
    await requestPasswordReset(email, "203.0.113.7");
    await requestPasswordReset(`nobody-${Date.now()}@example.com`, "203.0.113.7"); // same silent success
    const resetRow = await prisma.passwordResetToken.findFirstOrThrow({ where: { userId: user.id, usedAt: null } });
    // We only store the hash, so mint a known token for the test by replacing the hash.
    const raw = `smoke-${Date.now()}-token-value`;
    await prisma.passwordResetToken.update({ where: { id: resetRow.id }, data: { tokenHash: hashToken(raw) } });
    await resetPassword(raw, "another-long-password");
    await assert.rejects(resetPassword(raw, "another-long-password"), AccountFlowError);
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    assert.equal(after.sessionVersion, before + 1);
    console.log("5 password reset single-use, unknown email silent, sessions revoked ✓");
  } finally {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      await prisma.workspaceMember.deleteMany({ where: { userId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
    await prisma.invitation.deleteMany({ where: { email } });
    await prisma.emailOutbox.deleteMany({ where: { to: { startsWith: "smoke-rbac-" } } });
    if (customRoleId) await prisma.role.delete({ where: { id: customRoleId } }).catch(() => {});
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
