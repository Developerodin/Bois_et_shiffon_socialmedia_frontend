import { fromAccessError } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { prisma } from "@/server/db/prisma";
import { kickIfDue } from "@/server/jobs/runner";
import { listContextDocs } from "@/server/services/context-docs";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "agents.read");
    if (scope instanceof Response) return scope;
    // The welcome screen polls this while research runs: pick up an overdue retry between cron runs.
    await kickIfDue().catch(() => {});
    const [docs, research] = await Promise.all([
      listContextDocs(scope.workspaceId, scope.brandId),
      prisma.agentRun.findFirst({
        where: { workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "research" },
        orderBy: { createdAt: "desc" },
        select: { id: true, status: true, error: true },
      }),
    ]);
    return Response.json({
      docs,
      research: research ? { runId: research.id, status: research.status, error: research.status === "FAILED" ? research.error : null } : null,
    });
  } catch (error) {
    return fromAccessError(error);
  }
}
