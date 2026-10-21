import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { prisma } from "@/server/db/prisma";

/** Stop tracking a competitor (the shared audits of its domain stay in the library). */
export async function DELETE(request: Request, context: { params: Promise<BrandRouteParams & { competitorId: string }> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "agents.run");
    if (scope instanceof Response) return scope;
    const { competitorId } = await context.params;
    const { count } = await prisma.competitor.deleteMany({ where: { id: competitorId, workspaceId: scope.workspaceId, brandId: scope.brandId } });
    if (!count) return problemResponse({ type: "https://api.brandpilot/errors/not-found", title: "Not found", status: 404 });
    return new Response(null, { status: 204 });
  } catch (error) {
    return fromAccessError(error);
  }
}
