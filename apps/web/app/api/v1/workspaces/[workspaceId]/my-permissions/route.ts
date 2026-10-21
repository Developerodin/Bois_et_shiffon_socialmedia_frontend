import { auth } from "@/auth";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { requireWorkspaceMember } from "@/server/auth/access";
import { effectivePermissions } from "@/server/auth/permissions";

export async function GET(_request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const session = await auth();
  if (!session?.user?.id) {
    return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
  }
  const { workspaceId } = await context.params;
  try {
    await requireWorkspaceMember(workspaceId, session.user.id);
    return Response.json({ permissions: [...(await effectivePermissions(workspaceId, session.user.id))] });
  } catch (error) {
    return fromAccessError(error);
  }
}
