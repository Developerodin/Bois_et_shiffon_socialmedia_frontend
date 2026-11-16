import type { AgentRun } from "@prisma/client";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { AgentStartError, startAgentRun } from "@/server/agents/engine";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db/prisma";
import { kickIfDue, kickRunner } from "@/server/jobs/runner";
import type { TenantScope } from "@/server/tenant/scope";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

/** Free restarts after failures, per brand per day: onboarding's Scout is free, so it mustn't become a free Scout. */
const RESTARTS_PER_DAY = 3;

const latestScout = (scope: Required<TenantScope>) =>
  prisma.agentRun.findFirst({ where: { brandId: scope.brandId, workspaceId: scope.workspaceId, agentKey: "scout" }, orderBy: { createdAt: "desc" } });

function view(run: AgentRun | null) {
  const out = (run?.output ?? {}) as { created?: number; refreshed?: number };
  return { run: run && { id: run.id, status: run.status, error: run.error, ideas: (out.created ?? 0) + (out.refreshed ?? 0) } };
}

/**
 * The brand's first post ideas (mobile onboarding A11): Scout run as part of onboarding, so it's free like Research.
 * GET follows the latest Scout run (null before any). POST starts one only when the brand has none yet, or the
 * last one failed; otherwise it returns that run, so going back and forth never starts a second. While Research is
 * still writing, POST answers `waiting: true` and starts nothing.
 */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    // The app polls this while it waits: if the run is stuck behind other work (the runner stops between jobs
    // when its time budget is spent), start the runner again instead of waiting for the cron.
    await kickIfDue().catch(() => {});
    return Response.json(view(await latestScout(scope)));
  } catch (error) {
    return fromAccessError(error);
  }
}

export async function POST(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "agents.run");
    if (scope instanceof Response) return scope;
    const latest = await latestScout(scope);
    if (latest && latest.status !== "FAILED") return Response.json(view(latest));
    // Scout plans from Research's five documents, which now finish after onboarding has moved on to A09: don't start
    // it until they're written. The app asks again. A failed Research still lets Scout work from what was written.
    // (Other runners can run jobs in parallel, so the queue's order alone doesn't guarantee this.)
    const research = await prisma.agentRun.findFirst({ where: { brandId: scope.brandId, workspaceId: scope.workspaceId, agentKey: "research" }, orderBy: { createdAt: "desc" }, select: { status: true } });
    if (research?.status === "QUEUED" || research?.status === "RUNNING") {
      await kickIfDue().catch(() => {});
      return Response.json({ run: null, waiting: true }, { status: 202 });
    }
    const { allowed } = await hitRateLimit(`first-ideas:${scope.brandId}`, RESTARTS_PER_DAY, 86_400_000);
    if (!allowed) {
      return problemResponse({ type: "https://api.brandpilot/errors/agent-start", title: "Agent could not start", status: 429, detail: "Finding ideas failed several times today. Your ideas will come with tomorrow's daily run." });
    }
    // Two taps at once share one run: startAgentRun joins an in-flight run with the same input.
    const run = await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "scout", trigger: "event", userId: scope.userId });
    kickRunner();
    return Response.json(view(run), { status: 202 });
  } catch (error) {
    if (error instanceof AgentStartError) {
      return problemResponse({ type: "https://api.brandpilot/errors/agent-start", title: "Agent could not start", status: error.status, detail: error.message });
    }
    return fromAccessError(error);
  }
}
