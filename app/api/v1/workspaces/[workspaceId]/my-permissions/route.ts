import { auth } from "@/auth";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { requireBrandAccess, requireWorkspaceMember } from "@/server/auth/access";
import { effectivePermissions } from "@/server/auth/permissions";

/** The caller's permissions in the workspace, or on one project with ?brandId= (workspace ∪ project role). */
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
  }
  const { workspaceId } = await context.params;
  try {
    const brandId = new URL(request.url).searchParams.get("brandId") ?? undefined;
    if (brandId) await requireBrandAccess(workspaceId, brandId, session.user.id, { allowArchived: true });
    else await requireWorkspaceMember(workspaceId, session.user.id);
    return Response.json({ permissions: [...(await effectivePermissions(workspaceId, session.user.id, brandId))] });
  } catch (error) {
    return fromAccessError(error);
  }
}
