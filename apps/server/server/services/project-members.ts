import type { Prisma } from "@prisma/client";
import { memberRole } from "@/server/auth/permissions";
import { prisma } from "@/server/db/prisma";
import { AccountFlowError, createInvitation } from "@/server/services/accounts";

/**
 * People on one project (brand): workspace Owners/Admins reach it through their workspace role;
 * everyone else through a project grant (BrandMember) with a PROJECT role.
 */
export async function listProjectPeople(workspaceId: string, brandId: string) {
  const [members, grants, invites] = await Promise.all([
    prisma.workspaceMember.findMany({ where: { workspaceId }, include: { user: true, roleRef: true }, orderBy: { createdAt: "asc" } }),
    prisma.brandMember.findMany({ where: { workspaceId, brandId }, include: { user: true, role: true }, orderBy: { createdAt: "asc" } }),
    prisma.invitation.findMany({
      where: { workspaceId, brandId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      include: { role: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    // ponytail: legacy members with roleId null are left out here; none exist since the role migration.
    viaWorkspace: members
      .filter((m) => m.roleRef?.permissions.includes("brand.read"))
      .map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.roleRef!.name })),
    people: grants.map((g) => ({ id: g.id, userId: g.userId, name: g.user.name, email: g.user.email, role: { id: g.role.id, name: g.role.name } })),
    invitations: invites.map((i) => ({ id: i.id, email: i.email, role: { id: i.role.id, name: i.role.name }, expiresAt: i.expiresAt.toISOString() })),
  };
}

async function projectRole(workspaceId: string, roleId: string) {
  const role = await prisma.role.findFirst({ where: { id: roleId, workspaceId, scope: "PROJECT" } });
  if (!role) throw new AccountFlowError("Pick a project role", 404);
  return role;
}

/** Add someone to the project: a grant if they're already in the workspace, else a project invitation. */
export async function addToProject(input: { workspaceId: string; brandId: string; actorUserId: string; email: string; roleId: string }) {
  const role = await projectRole(input.workspaceId, input.roleId);
  const email = input.email.trim().toLowerCase();
  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId: input.workspaceId, user: { email } } });
  if (!member) {
    const { invitation, inviteUrl, emailDelivery } = await createInvitation({
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      email,
      roleId: role.id,
      invitedByUserId: input.actorUserId,
    });
    return { invited: true as const, invitationId: invitation.id, inviteUrl, emailDelivery };
  }
  if ((await memberRole(input.workspaceId, member.userId))?.role?.permissions.includes("brand.read")) {
    throw new AccountFlowError("This person already reaches every project through their workspace role", 409);
  }
  const grant = await prisma.brandMember.upsert({
    where: { brandId_userId: { brandId: input.brandId, userId: member.userId } },
    update: { roleId: role.id },
    create: { workspaceId: input.workspaceId, brandId: input.brandId, userId: member.userId, roleId: role.id },
  });
  await audit(input, "project.member_added", grant.id, { userId: member.userId, roleId: role.id });
  return { invited: false as const };
}

export async function changeProjectRole(input: { workspaceId: string; brandId: string; actorUserId: string; grantId: string; roleId: string }) {
  const role = await projectRole(input.workspaceId, input.roleId);
  const res = await prisma.brandMember.updateMany({
    where: { id: input.grantId, workspaceId: input.workspaceId, brandId: input.brandId },
    data: { roleId: role.id },
  });
  if (res.count === 0) throw new AccountFlowError("This person isn't on the project", 404);
  await audit(input, "project.role_changed", input.grantId, { roleId: role.id });
}

export async function removeFromProject(input: { workspaceId: string; brandId: string; actorUserId: string; grantId: string }) {
  const res = await prisma.brandMember.deleteMany({ where: { id: input.grantId, workspaceId: input.workspaceId, brandId: input.brandId } });
  if (res.count === 0) throw new AccountFlowError("This person isn't on the project", 404);
  await audit(input, "project.member_removed", input.grantId, {});
}

export async function revokeProjectInvitation(input: { workspaceId: string; brandId: string; actorUserId: string; invitationId: string }) {
  const res = await prisma.invitation.updateMany({
    where: { id: input.invitationId, workspaceId: input.workspaceId, brandId: input.brandId, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (res.count === 0) throw new AccountFlowError("Invitation not found or no longer pending", 404);
  await audit(input, "invitation.revoked", input.invitationId, {});
}

async function audit(scope: { workspaceId: string; brandId: string; actorUserId: string }, action: string, entityId: string, metadata: object) {
  await prisma.auditEvent.create({
    data: {
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      actorUserId: scope.actorUserId,
      action,
      entityType: action.startsWith("invitation") ? "Invitation" : "BrandMember",
      entityId,
      metadata: metadata as Prisma.InputJsonValue,
    },
  });
}
