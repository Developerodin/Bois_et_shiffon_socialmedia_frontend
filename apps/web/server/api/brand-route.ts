import { requestUserId } from "@/server/auth/request-user";
import { problemResponse } from "@/server/api/http-error";
import { assertWorkspaceHeaderMatchesPath } from "@/server/api/workspace-headers";
import { requireBrandAccess } from "@/server/auth/access";
import type { PermissionKey } from "@/server/auth/permissions.catalog";
import { requirePermission } from "@/server/auth/permissions";

export type BrandRouteParams = { workspaceId: string; brandId: string };

/**
 * Shared guard for /workspaces/:workspaceId/brands/:brandId/* routes:
 * session → header/path match (AT-017) → brand access (AT-001/019) → permission.
 * Returns the scope, or a Response to return as-is. Throws access errors for fromAccessError.
 */
export async function authorizeBrandRoute(
  request: Request,
  params: Promise<BrandRouteParams>,
  permission: PermissionKey,
) {
  const userId = await requestUserId(request);
  if (!userId) {
    return problemResponse({
      type: "https://api.brandpilot/errors/unauthorized",
      title: "Unauthorized",
      status: 401,
    });
  }
  const { workspaceId, brandId } = await params;
  assertWorkspaceHeaderMatchesPath(workspaceId, request.headers.get("X-Workspace-Id"));
  await requireBrandAccess(workspaceId, brandId, userId);
  await requirePermission(workspaceId, userId, permission, brandId);
  return { userId: userId, workspaceId, brandId };
}
