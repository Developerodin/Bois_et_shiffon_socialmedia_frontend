/**
 * Live RBAC + account-flow check on Neon (services, no server needed):
 * project invite → accept (single use) → Member sees only that project with the project role →
 * project admin adds a colleague, can't reach another project → custom role → role change →
 * last-owner guard → password reset (single use, revokes sessions). Cleans up.
 * Run: npm run smoke:rbac -w web
 */
import type { PermissionKey } from "@/server/auth/permissions.catalog";
import assert from "node:assert/strict";
import { prisma } from "@/server/db/prisma";
import { requireBrandAccess } from "@/server/auth/access";
import { effectivePermissions } from "@/server/auth/permissions";
import { listAccessibleBrands } from "@/server/services/brands";
import { addToProject } from "@/server/services/project-members";
import { hashToken } from "@/server/auth/tokens";
import {
  acceptInvitation,
  AccountFlowError,
  createInvitation,
  previewInvitation,
  requestPasswordReset,
  resetPassword,
} from "@/server/services/accounts";
import { changeMemberRole, createRole, deleteRole, listMembers, removeMember, transferPrimaryOwnership, updateRole } from "@/server/services/workspace-admin";

async function main() {
  const ws = await prisma.workspace.findFirstOrThrow({ include: { roles: true } });
  const owner = (await listMembers(ws.id)).find((m) => m.role?.slug === "owner")!;
  const role = (slug: string) => ws.roles.find((r) => r.slug === slug)!;
  const stamp = Date.now();
  const email = `smoke-rbac-${stamp}@example.com`;
  const colleague = `smoke-rbac-colleague-${stamp}@example.com`;
  let customRoleId: string | null = null;
  const brandA = await prisma.brand.findFirstOrThrow({ where: { workspaceId: ws.id } });
  const brandB = await prisma.brand.create({ data: { workspaceId: ws.id, slug: `smoke-rbac-${stamp}`, displayName: "Smoke other project" } });

  try {
    // 1. project invite + accept
    await assert.rejects(createInvitation({ workspaceId: ws.id, brandId: brandA.id, email, roleId: role("admin").id, invitedByUserId: owner.userId }), /project role/);
    const { inviteUrl, emailDelivery } = await createInvitation({ workspaceId: ws.id, brandId: brandA.id, email, roleId: role("project-admin").id, invitedByUserId: owner.userId });
    const token = inviteUrl.split("/invite/")[1];
    const preview = await previewInvitation(token);
    assert.equal(preview.roleName, "Project admin");
    assert.equal(preview.projectName, brandA.displayName);
    await assert.rejects(acceptInvitation({ token, name: "Smoke", password: "short" }), AccountFlowError);
    await acceptInvitation({ token, name: "Smoke", password: "a-long-enough-password" });
    await assert.rejects(acceptInvitation({ token, password: "a-long-enough-password" }), AccountFlowError);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    console.log(`1 project invite → accept (single use, weak password rejected, workspace role refused), email: ${emailDelivery} ✓`);

    // 2. only the invited project, with the project role; their own workspace exists
    let perms = await effectivePermissions(ws.id, user.id, brandA.id);
    assert.ok(perms.has("project.members.manage") && perms.has("publish.execute") && !perms.has("members.manage"));
    assert.deepEqual((await listAccessibleBrands(ws.id, user.id)).map((b) => b.id), [brandA.id]);
    await assert.rejects(requireBrandAccess(ws.id, brandB.id, user.id), /access/);
    assert.ok(!(await effectivePermissions(ws.id, user.id, brandB.id)).has("brand.read"));
    assert.ok(await prisma.workspaceMember.findFirst({ where: { userId: user.id, roleRef: { slug: "owner" } } }), "own workspace");
    console.log("2 Member sees only the invited project as Project admin; other project refused; own workspace ✓");

    // 3. the project admin brings in a colleague with a project role
    const add = await addToProject({ workspaceId: ws.id, brandId: brandA.id, actorUserId: user.id, email: colleague, roleId: role("creator").id });
    assert.equal(add.invited, true);
    await assert.rejects(addToProject({ workspaceId: ws.id, brandId: brandA.id, actorUserId: user.id, email: colleague, roleId: role("owner").id }), /project role/);
    await assert.rejects(addToProject({ workspaceId: ws.id, brandId: brandA.id, actorUserId: user.id, email: owner.email, roleId: role("viewer").id }), /every project/);
    console.log("3 project admin invites a Creator; can't hand out workspace roles; owners already reach every project ✓");

    // 4. custom project role + role change takes effect immediately
    await assert.rejects(createRole(ws.id, owner.userId, { name: `Smoke bad ${stamp}`, scope: "PROJECT", permissions: ["brand.read", "members.manage"] }), /project permissions/);
    const custom = await createRole(ws.id, owner.userId, { name: `Smoke runner ${stamp}`, scope: "PROJECT", permissions: ["brand.read", "agents.read", "agents.run"] });
    customRoleId = custom.id;
    const grant = await prisma.brandMember.findFirstOrThrow({ where: { brandId: brandA.id, userId: user.id } });
    await prisma.brandMember.update({ where: { id: grant.id }, data: { roleId: custom.id } });
    perms = await effectivePermissions(ws.id, user.id, brandA.id);
    assert.ok(perms.has("agents.run") && !perms.has("content.create"));
    await assert.rejects(deleteRole(ws.id, owner.userId, custom.id), AccountFlowError); // still assigned
    await prisma.brandMember.delete({ where: { id: grant.id } });
    console.log("4 custom project role: workspace permissions refused, change applies immediately, in-use role can't be deleted ✓");

    // 5. workspace role change + ownership guards (custom workspace role)
    const wsCustom = await createRole(ws.id, owner.userId, { name: `Smoke ws ${stamp}`, scope: "WORKSPACE", permissions: ["brand.read", "agents.read", "agents.run"] });
    await prisma.role.delete({ where: { id: custom.id } });
    customRoleId = wsCustom.id;
    const member = (await listMembers(ws.id)).find((m) => m.userId === user.id)!;
    await assert.rejects(changeMemberRole(ws.id, owner.userId, member.id, role("viewer").id), /workspace role/);
    await changeMemberRole(ws.id, owner.userId, member.id, wsCustom.id);
    assert.ok((await effectivePermissions(ws.id, user.id, brandB.id)).has("agents.run"), "workspace role reaches every project");

    const ownerRole = ws.roles.find((r) => r.slug === "owner")!;
    await assert.rejects(changeMemberRole(ws.id, user.id, member.id, ownerRole.id), AccountFlowError);
    // A non-owner can't reach ownership by invitation, or remove an owner.
    await assert.rejects(createInvitation({ workspaceId: ws.id, email: `takeover-${Date.now()}@example.com`, roleId: ownerRole.id, invitedByUserId: user.id }), /Only owners/);
    // The seeded owner is also the primary owner, so either guard may refuse first.
    await assert.rejects(removeMember(ws.id, user.id, owner.id), /Only owners|primary owner/);
    const owners = (await listMembers(ws.id)).filter((m) => m.role?.slug === "owner");
    if (owners.length === 1) {
      await assert.rejects(removeMember(ws.id, owner.userId, owners[0].id), AccountFlowError);
    }
    console.log("5 workspace role reaches every project; project role refused as workspace role; non-owner can't grant owner; last owner protected ✓");

    // 5b. primary owner: fixed until they hand it over; owners can edit built-in roles (not Owner)
    const primary = (await listMembers(ws.id)).find((m) => m.isPrimaryOwner)!;
    assert.ok(primary, "workspace has a primary owner");
    await assert.rejects(changeMemberRole(ws.id, primary.userId, primary.id, role("admin").id), /primary owner/);
    await assert.rejects(removeMember(ws.id, primary.userId, primary.id), /primary owner/);
    await assert.rejects(transferPrimaryOwnership(ws.id, user.id, primary.id), /Only the primary owner/);
    try {
      await transferPrimaryOwnership(ws.id, primary.userId, member.id);
      const after = await listMembers(ws.id);
      assert.ok(after.find((m) => m.userId === user.id)!.isPrimaryOwner && after.find((m) => m.userId === user.id)!.role!.slug === "owner");
      assert.ok(after.find((m) => m.userId === primary.userId)!.role!.slug === "owner", "previous primary stays Owner");
      await transferPrimaryOwnership(ws.id, user.id, primary.id);
    } finally {
      await prisma.workspace.update({ where: { id: ws.id }, data: { ownerUserId: primary.userId } });
    }
    const viewer = role("viewer");
    const vp = viewer.permissions as PermissionKey[];
    await assert.rejects(updateRole(ws.id, owner.userId, role("owner").id, { permissions: ["brand.read"] }), /Owner role/);
    await assert.rejects(updateRole(ws.id, user.id, viewer.id, { permissions: [...vp, "content.create"] }), /Only owners/);
    await updateRole(ws.id, owner.userId, viewer.id, { permissions: [...vp, "content.create"] });
    await updateRole(ws.id, owner.userId, viewer.id, { permissions: vp });
    console.log("5b primary owner can't be changed or removed; only they hand it over (both ways); owners edit built-in roles, not Owner ✓");

    // 6. password reset: single use + revokes sessions
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
    console.log("6 password reset single-use, unknown email silent, sessions revoked ✓");
  } finally {
    const u = await prisma.user.findUnique({ where: { email } });
    if (u) {
      // Only the test user's personal workspace: 5b makes them an Owner of the real workspace too.
      await prisma.workspace.deleteMany({ where: { ownerUserId: u.id, id: { not: ws.id } } });
      await prisma.brandMember.deleteMany({ where: { userId: u.id } });
      await prisma.workspaceMember.deleteMany({ where: { userId: u.id } });
      await prisma.auditEvent.deleteMany({ where: { actorUserId: u.id } });
      await prisma.user.delete({ where: { id: u.id } });
    }
    await prisma.invitation.deleteMany({ where: { email: { in: [email, colleague] } } });
    await prisma.brand.delete({ where: { id: brandB.id } });
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
