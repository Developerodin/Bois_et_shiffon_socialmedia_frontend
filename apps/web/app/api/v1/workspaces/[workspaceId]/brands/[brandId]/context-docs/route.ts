import { fromAccessError } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { prisma } from "@/server/db/prisma";
import { listContextDocs } from "@/server/services/context-docs";

export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "agents.read");
    if (scope instanceof Response) return scope;
    const [docs, research] = await Promise.all([
      listContextDocs(scope.workspaceId, scope.brandId),
      prisma.agentRun.findFirst({
        where: { workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "research" },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true },
      }),
    ]);
    return Response.json({
      docs,
      research: research ? { runId: research.id, status: research.status } : null,
    });
  } catch (error) {
    return fromAccessError(error);
  }
}
