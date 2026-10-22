import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse } from "@/server/api/workspace-route";
import { revokeProjectInvitation } from "@/server/services/project-members";

export async function DELETE(request: Request, context: { params: Promise<BrandRouteParams & { invitationId: string }> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "project.members.manage");
    if (scope instanceof Response) return scope;
    const { invitationId } = await context.params;
    await revokeProjectInvitation({ ...scope, actorUserId: scope.userId, invitationId });
    return new Response(null, { status: 204 });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
