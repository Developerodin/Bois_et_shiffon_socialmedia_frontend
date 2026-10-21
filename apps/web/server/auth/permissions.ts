import type { Prisma } from "@prisma/client";
import { AccessDeniedError } from "@/server/auth/errors";
import {
  LEGACY_ROLE_SLUG,
  SYSTEM_ROLES,
  type PermissionKey,
} from "@/server/auth/permissions.catalog";
import { prisma } from "@/server/db/prisma";

/**
 * Authorization engine (ported from Cad, simplified): effective permissions =
 * workspace role ∪ brand-scoped roles. If a brand has explicit members, only
 * they (plus holders of members.manage) can act on it (DEC-021 gate).
 * ponytail: computed per request (2 small indexed queries); cache by role
 * updatedAt if it shows up in traces.
 */
type Db = Prisma.TransactionClient | typeof prisma;

export async function ensureSystemRoles(workspaceId: string, db: Db = prisma) {
  for (const r of SYSTEM_ROLES) {
    await db.role.upsert({
      where: { workspaceId_slug: { workspaceId, slug: r.slug } },
      update: { name: r.name, description: r.description, permissions: r.permissions, isSystem: true },
      create: { workspaceId, slug: r.slug, name: r.name, description: r.description, permissions: r.permissions, isSystem: true },
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

  const brandMembers = await prisma.brandMember.findMany({ where: { brandId, workspaceId } });
  if (brandMembers.length === 0) return perms;
  const mine = brandMembers.find((m) => m.userId === userId);
  if (!mine) return perms.has("members.manage") ? perms : new Set();
  if (mine.roleIds.length) {
    const extra = await prisma.role.findMany({ where: { workspaceId, id: { in: mine.roleIds } } });
    for (const r of extra) for (const p of r.permissions) perms.add(p as PermissionKey);
  }
  return perms;
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
