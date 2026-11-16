import type { ShellResponse } from "@espanda/shared";
import { problemResponse } from "@/server/api/http-error";
import { requestUserId } from "@/server/auth/request-user";
import { effectivePermissions } from "@/server/auth/permissions";
import { isPlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db/prisma";
import { loadRoleLabel } from "@/server/shell/load-role-label";
import { loadShellContext } from "@/server/shell/load-shell-context";

/** The shell's data in one call: who is signed in, their workspaces and brands, and which are active. */
export async function GET(request: Request) {
  const userId = await requestUserId(request);
  const user = userId
    ? await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, image: true } })
    : null;
  if (!userId || !user) {
    return problemResponse({
      type: "https://api.brandpilot/errors/unauthorized",
      title: "Unauthorized",
      status: 401,
      detail: "Sign in required",
    });
  }

  const shell = await loadShellContext(userId);
  const { activeWorkspaceId, activeBrandId } = shell;
  const [workspacePermissions, brandPermissions, roleLabel, platformAdmin] = await Promise.all([
    activeWorkspaceId ? effectivePermissions(activeWorkspaceId, userId) : new Set<string>(),
    activeWorkspaceId && activeBrandId ? effectivePermissions(activeWorkspaceId, userId, activeBrandId) : new Set<string>(),
    activeWorkspaceId ? loadRoleLabel(activeWorkspaceId, userId) : null,
    isPlatformAdmin(userId),
  ]);

  const body = {
    user,
    workspaces: shell.workspaces.map(({ id, name, slug }) => ({ id, name, slug })),
    brands: shell.brands.map(({ id, slug, displayName, websiteUrl, status }) => ({ id, slug, displayName, websiteUrl, status })),
    activeWorkspaceId,
    activeBrandId,
    roleLabel,
    workspacePermissions: [...workspacePermissions],
    brandPermissions: [...brandPermissions],
    isPlatformAdmin: platformAdmin,
  } satisfies ShellResponse;
  return Response.json(body);
}
