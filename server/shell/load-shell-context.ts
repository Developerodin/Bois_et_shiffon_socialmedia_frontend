import { cookies } from "next/headers";
import {
  SHELL_COOKIE_BRAND,
  SHELL_COOKIE_WORKSPACE,
} from "@/lib/shell-cookies";
import { listAccessibleBrands, listUserWorkspaces } from "@/server/services/brands";
import { requireBrandAccess } from "@/server/auth/access";

export type ShellContext = {
  workspaces: Awaited<ReturnType<typeof listUserWorkspaces>>;
  brands: Awaited<ReturnType<typeof listAccessibleBrands>>;
  activeWorkspaceId: string | null;
  activeBrandId: string | null;
  hasActiveBrand: boolean;
};

export async function loadShellContext(userId: string): Promise<ShellContext> {
  const workspaces = await listUserWorkspaces(userId);
  const cookieStore = await cookies();
  const cookieWorkspaceId = cookieStore.get(SHELL_COOKIE_WORKSPACE)?.value;
  const cookieBrandId = cookieStore.get(SHELL_COOKIE_BRAND)?.value;

  const activeWorkspaceId =
    workspaces.find((w) => w.id === cookieWorkspaceId)?.id ??
    workspaces[0]?.id ??
    null;

  let brands: Awaited<ReturnType<typeof listAccessibleBrands>> = [];
  let activeBrandId: string | null = null;

  if (activeWorkspaceId) {
    brands = await listAccessibleBrands(activeWorkspaceId, userId);
    const candidateBrandId =
      brands.find((b) => b.id === cookieBrandId)?.id ?? brands[0]?.id ?? null;

    if (candidateBrandId) {
      try {
        await requireBrandAccess(
          activeWorkspaceId,
          candidateBrandId,
          userId,
          { allowArchived: true },
        );
        activeBrandId = candidateBrandId;
      } catch {
        activeBrandId = brands[0]?.id ?? null;
      }
    }
  }

  return {
    workspaces,
    brands,
    activeWorkspaceId,
    activeBrandId,
    hasActiveBrand: !!activeBrandId,
  };
}
