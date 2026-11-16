import { BrandStatus } from "@prisma/client";
import { memberRole } from "@/server/auth/permissions";
import { prisma } from "@/server/db/prisma";

export type BrandListItem = {
  id: string;
  slug: string;
  displayName: string;
  status: BrandStatus;
  createdAt: Date; // the mobile app falls back to the newest business
  websiteUrl: string | null;
};

/**
 * Projects the user can open: all of them when the workspace role has brand.read
 * (Owner/Admin), otherwise those with a project grant whose role has it.
 */
export async function listAccessibleBrands(
  workspaceId: string,
  userId: string,
): Promise<BrandListItem[]> {
  const all = (await memberRole(workspaceId, userId))?.role?.permissions.includes("brand.read") ?? false;
  const brands = await prisma.brand.findMany({
    where: {
      workspaceId,
      ...(all ? {} : { members: { some: { userId, role: { permissions: { has: "brand.read" } } } } }),
    },
    orderBy: { displayName: "asc" },
    select: {
      id: true,
      slug: true,
      displayName: true,
      status: true,
      createdAt: true,
      // The app's business switcher tells two businesses with the same name apart by their website.
      profile: { select: { websiteUrl: true } },
    },
  });

  return brands.map(({ profile, ...b }) => ({ ...b, websiteUrl: profile?.websiteUrl ?? null }));
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
