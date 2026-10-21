import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { AgentStartError, startAgentRun } from "@/server/agents/engine";
import { getAgent } from "@/server/agents/registry";
import { kickRunner } from "@/server/jobs/runner";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

type Params = BrandRouteParams & { agentKey: string };

export async function POST(request: Request, context: { params: Promise<Params> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "agents.run");
    if (scope instanceof Response) return scope;
    const { agentKey } = await context.params;
    if (getAgent(agentKey)?.internal) {
      return problemResponse({ type: "https://api.brandpilot/errors/agent-start", title: "Agent could not start", status: 403, detail: "This agent is started from its own feature." });
    }
    const body = await request.json().catch(() => ({}));

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
