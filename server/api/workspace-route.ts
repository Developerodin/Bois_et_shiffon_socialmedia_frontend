import { requestUserId } from "@/server/auth/request-user";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { assertWorkspaceHeaderMatchesPath } from "@/server/api/workspace-headers";
import { requirePermission } from "@/server/auth/permissions";
import type { PermissionKey } from "@/server/auth/permissions.catalog";
import { AccountFlowError } from "@/server/services/accounts";

type Scope = { userId: string; workspaceId: string };

/**
 * Wraps a /workspaces/:workspaceId/* handler: session → header match (AT-017) →
 * workspace permission → handler, with uniform problem+json errors.
 */
export function workspaceHandler<P extends { workspaceId: string }>(
  permission: PermissionKey,
  handler: (request: Request, scope: Scope, params: P) => Promise<Response>,
) {
  return async (request: Request, context: { params: Promise<P> }) => {
    const userId = await requestUserId(request);
    if (!userId) {
      return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
    }
    const params = await context.params;
    try {
      assertWorkspaceHeaderMatchesPath(params.workspaceId, request.headers.get("X-Workspace-Id"));
      await requirePermission(params.workspaceId, userId, permission);
      return await handler(request, { userId: userId, workspaceId: params.workspaceId }, params);
    } catch (error) {
      return accountErrorResponse(error) ?? fromAccessError(error);
    }
  };
}

export function accountErrorResponse(error: unknown) {
  if (error instanceof AccountFlowError) {
    return problemResponse({
      type: "https://api.brandpilot/errors/account",
      title: error.status === 429 ? "Too many requests" : "Request failed",
      status: error.status,
      detail: error.message,
    });
  }
  return null;
}

export const invalid = (detail: string) =>
  problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 422, detail });
