import { fromAccessError } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { prisma } from "@/server/db/prisma";

/** Agent Log feed for one brand (REQ-PLAT-005). Poll with ?after=<last id>. */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "agents.read");
    if (scope instanceof Response) return scope;
    const url = new URL(request.url);
    const after = Number.parseInt(url.searchParams.get("after") ?? "", 10);
    const limit = Math.min(Math.max(Number.parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 200);

    const where = { workspaceId: scope.workspaceId, brandId: scope.brandId };
    // First load: latest `limit` events; later polls: everything after the cursor.
    const rows = Number.isFinite(after)
      ? await prisma.agentEvent.findMany({ where: { ...where, id: { gt: after } }, orderBy: { id: "asc" }, take: limit })
      : (await prisma.agentEvent.findMany({ where, orderBy: { id: "desc" }, take: limit })).reverse();

    return Response.json({
      events: rows.map((e) => ({
        id: String(e.id),
        runId: e.runId,
        agentKey: e.agentKey,
        createdAt: e.createdAt.toISOString(),
        level: e.level,
        message: e.message,
        entityType: e.entityType,
        entityId: e.entityId,
      })),
    });
  } catch (error) {
    return fromAccessError(error);
  }
}
