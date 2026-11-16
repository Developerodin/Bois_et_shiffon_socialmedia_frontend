import "server-only";
import { BrandStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { AccessDeniedError, BrandArchivedError } from "@/server/auth/errors";
import { effectivePermissions } from "@/server/auth/permissions";

export type BrandAccessOptions = {
  /** Allow read-style access when brand is archived (AT-024 history). */
  allowArchived?: boolean;
};

/**
 * Fail closed if the user is not a workspace member (AT-001 / AT-017).
 */
export async function requireWorkspaceMember(
  workspaceId: string,
  userId: string,
) {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });

  if (!member) {
    throw new AccessDeniedError("Not a workspace member");
  }

  return member;
}

/**
 * Workspace member + brand in workspace + brand.read on it: from the workspace role
 * (Owner/Admin reach every project) or from a project grant (BrandMember).
 */
export async function requireBrandAccess(
  workspaceId: string,
  brandId: string,
  userId: string,
  options?: BrandAccessOptions,
) {
  await requireWorkspaceMember(workspaceId, userId);

  const brand = await prisma.brand.findFirst({ where: { id: brandId, workspaceId } });
  if (!brand) {
    throw new AccessDeniedError("Brand not found in workspace");
  }

  if (brand.status === BrandStatus.ARCHIVED && !options?.allowArchived) {
    throw new BrandArchivedError();
  }

  if (!(await effectivePermissions(workspaceId, userId, brandId)).has("brand.read")) {
    throw new AccessDeniedError("You don't have access to this project");
  }

  return brand;
}
