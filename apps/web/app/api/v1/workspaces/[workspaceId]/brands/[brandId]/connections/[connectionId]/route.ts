import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { disconnect } from "@/server/services/connections";

export async function DELETE(
  request: Request,
  context: { params: Promise<BrandRouteParams & { connectionId: string }> },
) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "integrations.manage");
    if (scope instanceof Response) return scope;
    const { connectionId } = await context.params;
    const result = await disconnect({ ...scope, connectionId });
    if (!result) return problemResponse({ type: "https://api.brandpilot/errors/not-found", title: "Not found", status: 404 });
    return Response.json(result);
  } catch (error) {
    return fromAccessError(error);
  }
}
