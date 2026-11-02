import type { Prisma } from "@prisma/client";
import { AccessDeniedError } from "@/server/auth/errors";
import {
  LEGACY_ROLE_SLUG,
  SYSTEM_ROLES,
  type PermissionKey,
} from "@/server/auth/permissions.catalog";
import { prisma } from "@/server/db/prisma";

/**
 * Authorization engine: effective permissions on a project (brand) = workspace role ∪ that
 * project's role. Owner/Admin carry every project permission in their workspace role, so they
 * reach every project; a Member reaches only projects with a BrandMember grant.
 * ponytail: computed per request (2 small indexed queries); cache by role
 * updatedAt if it shows up in traces.
 */
type Db = Prisma.TransactionClient | typeof prisma;

export async function ensureSystemRoles(workspaceId: string, db: Db = prisma) {
  for (const r of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { workspaceId_slug: { workspaceId, slug: r.slug } },
      // Owners may have edited a built-in role's permissions: keep them (Owner always tracks the catalog).
      update: { name: r.name, description: r.description, scope: r.scope, isSystem: true, ...(r.slug === "owner" ? { permissions: r.permissions } : {}) },
      create: { workspaceId, slug: r.slug, name: r.name, description: r.description, scope: r.scope, permissions: r.permissions, isSystem: true },
    });
  }
}

/** The member's workspace role (DB role, or legacy enum mapped to a system role). */
export async function memberRole(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: { roleRef: true },
  });
  if (!member) return null;
  if (member.roleRef) return { member, role: member.roleRef };
  const role = await prisma.role.findUnique({
    where: { workspaceId_slug: { workspaceId, slug: LEGACY_ROLE_SLUG[member.role] } },
  });
  return { member, role };
}

export async function effectivePermissions(
  workspaceId: string,
  userId: string,
  brandId?: string,
): Promise<Set<PermissionKey>> {
  const found = await memberRole(workspaceId, userId);
  if (!found?.role) return new Set();
  const perms = new Set(found.role.permissions as PermissionKey[]);
  if (!brandId) return perms;

  const grant = await prisma.brandMember.findFirst({ where: { brandId, workspaceId, userId }, include: { role: true } });
  for (const p of grant?.role.permissions ?? []) perms.add(p as PermissionKey);
  return perms;
}

/**
 * Can someone other than `userId` approve this brand's content? A one-person business can't follow a four-eyes rule.
 * ponytail: checks every workspace member one by one; fine for small teams, a joined query if workspaces get large.
 */
export async function hasOtherApprover(workspaceId: string, brandId: string, userId: string) {
  const others = await prisma.workspaceMember.findMany({ where: { workspaceId, userId: { not: userId } }, select: { userId: true } });
  for (const o of others) if ((await effectivePermissions(workspaceId, o.userId, brandId)).has("content.approve")) return true;
  return false;
}

export async function requirePermission(
  workspaceId: string,
  userId: string,
  permission: PermissionKey,
  brandId?: string,
) {
  const perms = await effectivePermissions(workspaceId, userId, brandId);
  if (!perms.has(permission)) {
    throw new AccessDeniedError(`Missing permission ${permission}`);
  }
}
