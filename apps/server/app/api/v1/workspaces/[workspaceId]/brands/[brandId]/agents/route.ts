import { fromAccessError } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { AGENTS } from "@/server/agents/registry";
import { prisma } from "@/server/db/prisma";
import { kickIfDue } from "@/server/jobs/runner";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "agents.read");
    if (scope instanceof Response) return scope;
    const { workspaceId, brandId } = scope;
    // The open app polls this: use it to run overdue scheduled posts and retries between cron runs.
    await kickIfDue().catch(() => {});

    const [configs, lastRuns] = await Promise.all([
      prisma.brandAgentConfig.findMany({ where: { workspaceId, brandId } }),
      prisma.agentRun.findMany({
        where: { workspaceId, brandId },
        orderBy: { createdAt: "desc" },
        distinct: ["agentKey"],
        select: { id: true, agentKey: true, status: true, startedAt: true, finishedAt: true, error: true },
      }),
    ]);

    const agents = AGENTS.filter((a) => !a.internal).map((a) => {
      const run = lastRuns.find((r) => r.agentKey === a.key);
      return {
        key: a.key,
        name: a.name,
        description: a.description,
        enabled: configs.find((c) => c.agentKey === a.key)?.enabled ?? true,
        lastRun: run
          ? {
              id: run.id,
              status: run.status,
              startedAt: run.startedAt?.toISOString() ?? null,
              finishedAt: run.finishedAt?.toISOString() ?? null,
              error: run.status === "FAILED" ? (run.error?.slice(0, 300) ?? null) : null,
            }
          : null,
      };
    });
    return Response.json({ agents });
  } catch (error) {
    return fromAccessError(error);
  }
}
