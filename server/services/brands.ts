import { BrandStatus } from "@prisma/client";
import { prisma } from "@/server/db/prisma";

export type BrandListItem = {
  id: string;
  slug: string;
  displayName: string;
  status: BrandStatus;
};

/**
 * Brands the user may list under `brand.read` (DEC-021 BrandMember gate).
 */
export async function listAccessibleBrands(
  workspaceId: string,
  userId: string,
): Promise<BrandListItem[]> {
  const brands = await prisma.brand.findMany({
    where: {
      workspaceId,
      OR: [
        { members: { none: {} } },
        { members: { some: { userId } } },
      ],
    },
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      slug: true,
      displayName: true,
      status: true,
    },
  });

  return brands;
}

export async function listUserWorkspaces(userId: string) {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        select: { id: true, name: true, slug: true },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return memberships.map((m) => ({
    id: m.workspace.id,
    name: m.workspace.name,
    slug: m.workspace.slug,
    role: m.role,
  }));
}
