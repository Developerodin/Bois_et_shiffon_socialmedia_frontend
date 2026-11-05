import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { AgentStartError, startAgentRun } from "@/server/agents/engine";
import { getAgent } from "@/server/agents/registry";
import { prisma } from "@/server/db/prisma";
import { kickRunner } from "@/server/jobs/runner";
import { PlanRequiredError, requirePlan } from "@/server/services/subscriptions";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

type Params = BrandRouteParams & { agentKey: string };

/**
 * One run's status, polled with ?id=<run id> (mobile P09 shows when "Generate calendar" is done).
 * Failure text stays in the server log; only a "nothing to do" reason (an INFO event, written for the
 * person) is passed on.
 */
export async function GET(request: Request, context: { params: Promise<Params> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "agents.read");
    if (scope instanceof Response) return scope;
    const { agentKey } = await context.params;
    const id = new URL(request.url).searchParams.get("id") ?? "";
    const run = await prisma.agentRun.findFirst({
      where: { id, agentKey, workspaceId: scope.workspaceId, brandId: scope.brandId },
      select: { id: true, status: true, output: true },
    });
    if (!run) return problemResponse({ type: "https://api.brandpilot/errors/not-found", title: "Run not found", status: 404 });
    let reason: string | null = null;
    if (run.status === "FAILED") {
      const last = await prisma.agentEvent.findFirst({ where: { runId: run.id }, orderBy: { id: "desc" }, select: { level: true, message: true } });
      if (last?.level === "INFO") reason = last.message;
    }
    return Response.json({ run: { id: run.id, status: run.status, output: run.status === "SUCCEEDED" ? run.output : null, reason } });
  } catch (error) {
    return fromAccessError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<Params> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "agents.run");
    if (scope instanceof Response) return scope;
    const { agentKey } = await context.params;
    if (getAgent(agentKey)?.internal) {
      return problemResponse({ type: "https://api.brandpilot/errors/agent-start", title: "Agent could not start", status: 403, detail: "This agent is started from its own feature." });
    }
    const body = await request.json().catch(() => ({}));
    // Generating the calendar needs a plan (mobile L05).
    if (agentKey === "planner") {
      try {
        await requirePlan(scope.workspaceId);
      } catch (e) {
        if (e instanceof PlanRequiredError) return Response.json({ planRequired: true, title: e.message }, { status: 402 });
        throw e;
      }
    }

    const run = await startAgentRun({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      agentKey,
      trigger: "manual",
      userId: scope.userId,
      input: (body as { input?: unknown }).input,
    });
    kickRunner();
    return Response.json({ run: { id: run.id, status: run.status } }, { status: 202 });
  } catch (error) {
    if (error instanceof AgentStartError) {
      return problemResponse({
        type: "https://api.brandpilot/errors/agent-start",
        title: "Agent could not start",
        status: error.status,
        detail: error.message,
      });
    }
    return fromAccessError(error);
  }
}
