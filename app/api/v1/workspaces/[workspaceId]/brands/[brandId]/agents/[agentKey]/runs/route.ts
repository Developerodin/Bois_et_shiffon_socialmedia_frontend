import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { AgentStartError, startAgentRun } from "@/server/agents/engine";
import { kickRunner } from "@/server/jobs/runner";

type Params = BrandRouteParams & { agentKey: string };

export async function POST(request: Request, context: { params: Promise<Params> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "agents.run");
    if (scope instanceof Response) return scope;
    const { agentKey } = await context.params;
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
