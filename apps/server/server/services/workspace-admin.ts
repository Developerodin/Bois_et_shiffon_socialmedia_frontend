import type { Prisma } from "@prisma/client";
import { archiveMemberClones } from "@/server/reels/clones";
import { z } from "zod";
import { isPermissionKey, LEGACY_ROLE_SLUG, permissionScope } from "@/server/auth/permissions.catalog";
import { memberRole } from "@/server/auth/permissions";
import { prisma } from "@/server/db/prisma";
import { AccountFlowError } from "@/server/services/accounts";

/** Members + roles administration (Cad roles/members services, simplified). */

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "role";

export const RoleInput = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().trim().max(240).optional(),
  /** WORKSPACE roles may hold any permission (project ones then apply to every project); PROJECT roles only project ones. */
  scope: z.enum(["WORKSPACE", "PROJECT"]).default("WORKSPACE"),
  permissions: z.array(z.string()).refine((ps) => ps.every(isPermissionKey), "Unknown permission"),
});

function assertFitsScope(scope: "WORKSPACE" | "PROJECT", permissions: string[] | undefined) {
  if (scope === "PROJECT" && permissions?.some((p) => isPermissionKey(p) && permissionScope(p) === "WORKSPACE")) {
    throw new AccountFlowError("A project role can only hold project permissions", 409);
  }
}

export async function listRoles(workspaceId: string) {
  const roles = await prisma.role.findMany({
    where: { workspaceId },
    include: { _count: { select: { members: true, brandMembers: true } } },
    orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
  });
  return roles.map((r) => ({
    id: r.id,
    slug: r.slug,
    name: r.name,
    description: r.description,
    isSystem: r.isSystem,
    scope: r.scope,
    permissions: r.permissions.filter(isPermissionKey),
    memberCount: r._count.members + r._count.brandMembers,
  }));
}

/** Ownership-level powers stay with owners: a role editor can't hand them out (or keep them in a role). */
async function assertCanGrant(workspaceId: string, actorUserId: string, permissions: string[] | undefined) {
  if (!permissions?.includes("workspace.manage")) return;
  if ((await memberRole(workspaceId, actorUserId))?.role?.slug !== "owner") {
    throw new AccountFlowError("Only owners can give a role workspace ownership powers", 409);
  }
}

export async function createRole(workspaceId: string, actorUserId: string, input: z.infer<typeof RoleInput>) {
  await assertCanGrant(workspaceId, actorUserId, input.permissions);
  assertFitsScope(input.scope, input.permissions);
  const base = slugify(input.name);
  const taken = await prisma.role.count({ where: { workspaceId, slug: { startsWith: base } } });
  const role = await prisma.role.create({
    data: {
      workspaceId,
      slug: taken ? `${base}-${taken + 1}` : base,
      name: input.name,
      description: input.description,
      scope: input.scope,
      permissions: input.permissions,
    },
  });
  await audit(workspaceId, actorUserId, "role.created", role.id, { permissions: input.permissions });
  return role;
}

export async function updateRole(
  workspaceId: string,
  actorUserId: string,
  roleId: string,
  input: Partial<z.infer<typeof RoleInput>>,
) {
  const role = await prisma.role.findFirst({ where: { id: roleId, workspaceId } });
  if (!role) throw new AccountFlowError("Role not found", 404);
  // Built-in roles: owners may change their permissions (not their name); the Owner role always keeps everything.
  if (role.isSystem) {
    if (role.slug === "owner") throw new AccountFlowError("The Owner role always has every permission", 409);
    if (!(await memberRole(workspaceId, actorUserId))?.role?.permissions.includes("workspace.manage")) {
      throw new AccountFlowError("Only owners can change a built-in role", 409);
    }
  }
  await assertCanGrant(workspaceId, actorUserId, input.permissions);
  assertFitsScope(role.scope, input.permissions);
  const updated = await prisma.role.update({
    where: { id: role.id },
    data: role.isSystem
      ? { permissions: input.permissions }
      : { name: input.name, description: input.description, permissions: input.permissions },
  });
  await audit(workspaceId, actorUserId, "role.updated", role.id, { before: role.permissions, after: updated.permissions });
  return updated;
}

export async function deleteRole(workspaceId: string, actorUserId: string, roleId: string) {
  const role = await prisma.role.findFirst({
    where: { id: roleId, workspaceId },
    include: { _count: { select: { members: true, brandMembers: true, invitations: true } } },
  });
  if (!role) throw new AccountFlowError("Role not found", 404);
  if (role.isSystem) throw new AccountFlowError("System roles can't be deleted", 409);
  if (role._count.members || role._count.brandMembers || role._count.invitations) {
    throw new AccountFlowError("Move members and invitations off this role first", 409);
  }
  await prisma.role.delete({ where: { id: role.id } });
  await audit(workspaceId, actorUserId, "role.deleted", role.id, { name: role.name });
}

export async function listMembers(workspaceId: string) {
  const [members, workspace] = await Promise.all([
    prisma.workspaceMember.findMany({
      where: { workspaceId },
      include: { user: true, roleRef: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { ownerUserId: true } }),
  ]);
  const legacy = await prisma.role.findMany({ where: { workspaceId, isSystem: true } });
  return members.map((m) => {
    const role = m.roleRef ?? legacy.find((r) => r.slug === LEGACY_ROLE_SLUG[m.role]);
    return {
      id: m.id,
      userId: m.userId,
      name: m.user.name,
      email: m.user.email,
      status: m.user.status,
      role: role ? { id: role.id, name: role.name, slug: role.slug } : null,
      isPrimaryOwner: m.userId === workspace.ownerUserId,
      joinedAt: m.createdAt.toISOString(),
    };
  });
}

async function ownerCount(workspaceId: string) {
  const members = await listMembers(workspaceId);
  return members.filter((m) => m.role?.slug === "owner").length;
}

async function assertNotPrimaryOwner(workspaceId: string, userId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerUserId: true } });
  if (ws?.ownerUserId === userId) {
    throw new AccountFlowError("The primary owner can't be changed or removed. They can hand primary ownership to another member first.", 409);
  }
}

export async function changeMemberRole(workspaceId: string, actorUserId: string, memberId: string, roleId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
  if (!member) throw new AccountFlowError("Member not found", 404);
  await assertNotPrimaryOwner(workspaceId, member.userId);
  const role = await prisma.role.findFirst({ where: { id: roleId, workspaceId, scope: "WORKSPACE" } });
  if (!role) throw new AccountFlowError("Pick a workspace role", 404);
  const current = await memberRole(workspaceId, member.userId);
  // Only owners can create or remove owners.
  if (role.slug === "owner" || current?.role?.slug === "owner") {
    const actor = await memberRole(workspaceId, actorUserId);
    if (actor?.role?.slug !== "owner") throw new AccountFlowError("Only owners can change ownership", 409);
  }
  if (current?.role?.slug === "owner" && role.slug !== "owner" && (await ownerCount(workspaceId)) <= 1) {
    throw new AccountFlowError("A workspace needs at least one owner", 409);
  }
  const updated = await prisma.workspaceMember.update({ where: { id: member.id }, data: { roleId: role.id } });
  // Role change takes effect immediately: permissions are read per request.
  await audit(workspaceId, actorUserId, "member.role_changed", member.id, {
    userId: member.userId,
    from: current?.role?.slug ?? null,
    to: role.slug,
  });
  return updated;
}

export async function removeMember(workspaceId: string, actorUserId: string, memberId: string) {
  const member = await prisma.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
  if (!member) throw new AccountFlowError("Member not found", 404);
  await assertNotPrimaryOwner(workspaceId, member.userId);
  const current = await memberRole(workspaceId, member.userId);
  if (current?.role?.slug === "owner") {
    if ((await memberRole(workspaceId, actorUserId))?.role?.slug !== "owner") throw new AccountFlowError("Only owners can remove an owner", 409);
    if ((await ownerCount(workspaceId)) <= 1) throw new AccountFlowError("A workspace needs at least one owner", 409);
  }
  await prisma.$transaction(async (tx) => {
    await tx.brandMember.deleteMany({ where: { workspaceId, userId: member.userId } });
    await tx.workspaceMember.delete({ where: { id: member.id } });
    // Their cloned voices leave with them: archived, and deleted at ElevenLabs by a job queued in this transaction.
    await archiveMemberClones(tx, workspaceId, member.userId, actorUserId);
  });
  await audit(workspaceId, actorUserId, "member.removed", member.id, { userId: member.userId });
}

/** Only the primary owner can hand primary ownership over; the new primary owner becomes an Owner. The old one stays Owner. */
export async function transferPrimaryOwnership(workspaceId: string, actorUserId: string, memberId: string) {
  return prisma.$transaction(async (tx) => {
    // Row lock: two hand-overs at once can't both pass the check.
    const [ws] = await tx.$queryRaw<{ ownerUserId: string | null }[]>`SELECT "ownerUserId" FROM "Workspace" WHERE "id" = ${workspaceId} FOR UPDATE`;
    if (ws?.ownerUserId !== actorUserId) throw new AccountFlowError("Only the primary owner can hand primary ownership over", 409);
    const member = await tx.workspaceMember.findFirst({ where: { id: memberId, workspaceId } });
    if (!member) throw new AccountFlowError("Member not found", 404);
    if (member.userId === actorUserId) throw new AccountFlowError("You're already the primary owner", 409);
    const owner = await tx.role.findUniqueOrThrow({ where: { workspaceId_slug: { workspaceId, slug: "owner" } } });
    await tx.workspaceMember.update({ where: { id: member.id }, data: { role: "OWNER", roleId: owner.id } });
    await tx.workspace.update({ where: { id: workspaceId }, data: { ownerUserId: member.userId } });
    await tx.auditEvent.create({
      data: { workspaceId, actorUserId, action: "workspace.primary_owner_transferred", entityType: "Workspace", entityId: workspaceId, metadata: { from: actorUserId, to: member.userId } },
    });
  });
}

export async function listInvitations(workspaceId: string) {
  const rows = await prisma.invitation.findMany({
    where: { workspaceId },
    include: { role: true, brand: { select: { displayName: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const inviterIds = [...new Set(rows.map((r) => r.invitedByUserId).filter(Boolean))] as string[];
  const inviters = await prisma.user.findMany({ where: { id: { in: inviterIds } }, select: { id: true, name: true, email: true } });
  const now = new Date();
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    role: { id: r.role.id, name: r.role.name },
    project: r.brand?.displayName ?? null,
    status: r.acceptedAt ? "ACCEPTED" : r.revokedAt ? "REVOKED" : r.expiresAt < now ? "EXPIRED" : "PENDING",
    expiresAt: r.expiresAt.toISOString(),
    createdAt: r.createdAt.toISOString(),
    invitedBy: (() => {
      const u = inviters.find((i) => i.id === r.invitedByUserId);
      return u ? (u.name ?? u.email) : null;
    })(),
  }));
}

export async function revokeInvitation(workspaceId: string, actorUserId: string, id: string) {
  const res = await prisma.invitation.updateMany({
    where: { id, workspaceId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) throw new AccountFlowError("Invitation not found or no longer pending", 404);
  await audit(workspaceId, actorUserId, "invitation.revoked", id, {});
}

async function audit(workspaceId: string, actorUserId: string, action: string, entityId: string, metadata: object) {
  await prisma.auditEvent.create({
    data: {
      workspaceId,
      actorUserId,
      action,
      entityType: action.split(".")[0],
      entityId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}

