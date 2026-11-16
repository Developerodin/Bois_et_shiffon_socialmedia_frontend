import { z } from "zod";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { changeProjectRole, removeFromProject } from "@/server/services/project-members";

type Ctx = { params: Promise<BrandRouteParams & { grantId: string }> };

export async function PATCH(request: Request, context: Ctx) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "project.members.manage");
    if (scope instanceof Response) return scope;
    const body = z.object({ roleId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
    if (!body.success) return invalid("Pick a role");
    const { grantId } = await context.params;
    await changeProjectRole({ ...scope, actorUserId: scope.userId, grantId, roleId: body.data.roleId });
    return Response.json({ ok: true });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}

export async function DELETE(request: Request, context: Ctx) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "project.members.manage");
    if (scope instanceof Response) return scope;
    const { grantId } = await context.params;
    await removeFromProject({ ...scope, actorUserId: scope.userId, grantId });
    return new Response(null, { status: 204 });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
