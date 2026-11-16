import { AccessDeniedError } from "@/server/auth/errors";

/**
 * AT-017 — `X-Workspace-Id` must match path `:workspaceId` when present.
 */
export function assertWorkspaceHeaderMatchesPath(
  pathWorkspaceId: string,
  headerWorkspaceId: string | null,
) {
  if (!headerWorkspaceId) {
    return;
  }
  if (headerWorkspaceId !== pathWorkspaceId) {
    throw new AccessDeniedError("Workspace header mismatch");
  }
}
