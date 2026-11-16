import { cookies } from "next/headers";
import {
  SHELL_COOKIE_BRAND,
  SHELL_COOKIE_WORKSPACE,
} from "@espanda/shared";
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

  let activeWorkspaceId = workspaces.find((w) => w.id === cookieWorkspaceId)?.id ?? null;
  let brands: Awaited<ReturnType<typeof listAccessibleBrands>> = [];
  let activeBrandId: string | null = null;

  // No choice yet: open the first workspace with a project this person can see (an invitee's
  // shared project rather than their own empty workspace), else the first one.
  if (!activeWorkspaceId) {
    for (const w of workspaces) {
      brands = await listAccessibleBrands(w.id, userId);
      if (brands.length) {
        activeWorkspaceId = w.id;
        break;
      }
    }
    activeWorkspaceId ??= workspaces[0]?.id ?? null;
  }

  if (activeWorkspaceId) {
    if (!brands.length) brands = await listAccessibleBrands(activeWorkspaceId, userId);
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
