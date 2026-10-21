import { BrandStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { AccessDeniedError, BrandArchivedError } from "@/server/auth/errors";

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
 * Workspace member + brand in workspace + optional BrandMember gate (DEC-021).
 */
export async function requireBrandAccess(
  workspaceId: string,
  brandId: string,
  userId: string,
  options?: BrandAccessOptions,
) {
  await requireWorkspaceMember(workspaceId, userId);

  const brand = await prisma.brand.findFirst({
    where: { id: brandId, workspaceId },
    include: {
      members: { where: { userId }, take: 1 },
    },
  });

  if (!brand) {
    throw new AccessDeniedError("Brand not found in workspace");
  }

  if (brand.status === BrandStatus.ARCHIVED && !options?.allowArchived) {
    throw new BrandArchivedError();
  }

  const restrictedMemberCount = await prisma.brandMember.count({
    where: { brandId },
  });

  if (restrictedMemberCount > 0 && brand.members.length === 0) {
    throw new AccessDeniedError("No brand-level access grant");
  }

  return brand;
}
