import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { loadBrandContext } from "@/server/agents/brand-context";
import { getAgent } from "@/server/agents/registry";
import type { AgentContext } from "@/server/agents/types";
import { generateObject, OUT_OF_CREDITS } from "@/server/ai/provider";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db/prisma";
import { CREDIT_COSTS, FREE_MANUAL_AGENTS, InsufficientCreditsError, refundCharge, spendCredits } from "@/server/services/credits";
import { validateAiWorkflowPayload } from "@/server/jobs/claim";
import { enqueueJob } from "@/server/jobs/queue";

export const AGENT_RUN_JOB = "agent.run";

export const MANUAL_RUNS_PER_DAY = 100;

export class AgentStartError extends Error {
  constructor(
    message: string,
    readonly status: 402 | 404 | 409 | 422 | 429,
  ) {
    super(message);
    this.name = "AgentStartError";
  }
}

/** The agent ran fine and found no work (e.g. no new drafts). Not retried; the UI shows it as "nothing to do". */
export class NothingToDoError extends Error {
  name = "NothingToDoError";
}

export const AgentRunJobPayload = z.object({
  workspaceId: z.string(),
  brandId: z.string(),
  runId: z.string(),
});

/** Creates the run + its job atomically; the caller kicks the runner. */
export async function startAgentRun(input: {
  workspaceId: string;
  brandId: string;
  agentKey: string;
  trigger: "manual" | "schedule" | "event";
  userId?: string;
  input?: unknown;
  /** Server-side only: a caller that already charged (competitor audits). Never from request input. */
  prepaidChargeId?: string;
}) {
  const agent = getAgent(input.agentKey);
  if (!agent) throw new AgentStartError(`Unknown agent ${input.agentKey}`, 404);
  const config = await prisma.brandAgentConfig.findUnique({
    where: { brandId_agentKey: { brandId: input.brandId, agentKey: agent.key } },
  });
  if (config && !config.enabled) {
    throw new AgentStartError(`${agent.name} is disabled for this brand`, 409);
  }
  const parsed = agent.inputSchema.safeParse(input.input ?? {});
  if (!parsed.success) throw new AgentStartError(parsed.error.message, 422);
  // Every run spends AI credits: cap what people (and scripts) can start per workspace per day.
  // ponytail: one flat cap; per-plan allowances come with billing.
  if (input.trigger === "manual") {
    const { allowed } = await hitRateLimit(`agent-runs:${input.workspaceId}`, MANUAL_RUNS_PER_DAY, 86_400_000);
    if (!allowed) throw new AgentStartError(`This workspace has started ${MANUAL_RUNS_PER_DAY} agent runs today, the daily limit. Try again tomorrow.`, 429);
  }

  // Manual runs cost credits, refunded if the run finally fails. Callers that already charged
  // (competitor audits) pass prepaidChargeId; schedule/event runs are free. Billing never reads agent input.
  const agentInput: Record<string, unknown> = { ...(parsed.data as object) };
  delete agentInput.chargeId;
  let chargeId = input.prepaidChargeId;
  const chargedHere = input.trigger === "manual" && !chargeId && !FREE_MANUAL_AGENTS.has(agent.key);
  if (chargedHere) {
    try {
      chargeId = await spendCredits({ workspaceId: input.workspaceId, amount: CREDIT_COSTS.manualRun, reason: `agent-run:${agent.key}`, userId: input.userId });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) throw new AgentStartError(`This run needs ${e.needed} credits; you have ${e.balance}.`, 402);
      throw e;
    }
  }
  const runInput = chargeId ? { ...agentInput, chargeId } : agentInput;

  const run = await prisma.$transaction(async (tx) => {
    // Double clicks and two people pressing Run share one run instead of paying twice.
    // ponytail: a run stuck past 30 min no longer blocks a fresh one; the lease reclaim handles the old job.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`agent-start:${input.brandId}:${agent.key}`}))`;
    const inFlight = await tx.agentRun.findMany({
      where: { brandId: input.brandId, agentKey: agent.key, status: { in: ["QUEUED", "RUNNING"] }, createdAt: { gte: new Date(Date.now() - 30 * 60_000) } },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    // Same job = same input, ignoring who paid for it (a paid caller refunds when it gets someone else's run).
    const key = (v: unknown) => JSON.stringify({ ...(v as object), chargeId: undefined });
    const same = inFlight.find((r) => key(r.input) === key(parsed.data));
    if (same) return same;
    const run = await tx.agentRun.create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        agentKey: agent.key,
        trigger: input.trigger,
        triggeredByUserId: input.userId,
        input: runInput as Prisma.InputJsonValue,
      },
    });
    await tx.agentEvent.create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        runId: run.id,
        agentKey: agent.key,
        message: `${agent.name} queued (${input.trigger})`,
      },
    });
    await enqueueJob(
      {
        type: AGENT_RUN_JOB,
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        payload: { workspaceId: input.workspaceId, brandId: input.brandId, runId: run.id },
        idempotencyKey: `agent-run:${run.id}`,
      },
      tx,
    );
    await tx.auditEvent.create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        actorUserId: input.userId,
        action: "agent.run.requested",
        entityType: "AgentRun",
        entityId: run.id,
        metadata: { agentKey: agent.key, trigger: input.trigger },
      },
    });
    return run;
  }).catch(async (e) => {
    if (chargedHere && chargeId) await refundCharge(input.workspaceId, chargeId);
    throw e;
  });
  // Joined someone else's in-flight run: they paid, give this charge back. (Prepaid callers refund their own.)
  if (chargedHere && chargeId && (run.input as { chargeId?: string } | null)?.chargeId !== chargeId) await refundCharge(input.workspaceId, chargeId);
  return run;
}

/** Job handler. Throws on failure so the queue applies retry/backoff. */
export async function executeAgentRun(rawPayload: unknown) {
  const payload = AgentRunJobPayload.parse(rawPayload);
  validateAiWorkflowPayload(payload);
  const run = await prisma.agentRun.findFirstOrThrow({
    where: { id: payload.runId, brandId: payload.brandId, workspaceId: payload.workspaceId },
  });
  // Idempotent: a duplicate delivery of a finished run is a no-op.
  if (run.status === "SUCCEEDED" || run.status === "FAILED") return;
  const agent = getAgent(run.agentKey);
  if (!agent) throw new Error(`Agent ${run.agentKey} no longer registered`);

  const log: AgentContext["log"] = async (level, message, entity, data) => {
    await prisma.agentEvent.create({
      data: {
        workspaceId: run.workspaceId,
        brandId: run.brandId,
        runId: run.id,
        agentKey: run.agentKey,
        level,
        message,
        entityType: entity?.type,
        entityId: entity?.id,
        data,
      },
    });
  };

  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: "RUNNING", startedAt: run.startedAt ?? new Date(), error: null },
  });
  await log("INFO", `${agent.name} started`);

  const ctx: AgentContext = {
    runId: run.id,
    brand: await loadBrandContext(run.workspaceId, run.brandId),
    chargeId: (run.input as { chargeId?: string } | null)?.chargeId,
    log,
    ai: {
      generateObject: ({ workflowId, promptVersion, ...input }) =>
        generateObject(
          {
            workspaceId: run.workspaceId,
            brandId: run.brandId,
            agentRunId: run.id,
            userId: run.triggeredByUserId ?? undefined,
            workflowId,
            promptVersion,
          },
          input,
        ),
    },
  };

  // chargeId is billing bookkeeping, not agent input (most input schemas are strict).
  const agentInput: Record<string, unknown> = { ...((run.input ?? {}) as object) };
  delete agentInput.chargeId;
  const output = await agent.run(ctx, agent.inputSchema.parse(agentInput));
  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: "SUCCEEDED", finishedAt: new Date(), output: output ?? undefined },
  });
  await log("SUCCESS", `${agent.name} finished`);
}

/**
 * Whether a run already saved its work: a content version it wrote, or a story render it queued (that job refunds on
 * its own failure, onStoryRenderFailure). ponytail: ContentVersion.agentRunId has no index; this only runs when a paid
 * run finally fails. Add one if that path gets frequent.
 */
async function delivered(run: { id: string; workspaceId: string; brandId: string }) {
  const version = await prisma.contentVersion.findFirst({ where: { agentRunId: run.id, item: { workspaceId: run.workspaceId } }, select: { id: true } });
  if (version) return true;
  // "story.render" written out: importing STORY_RENDER_JOB from stories/service would be circular (it imports this file).
  const render = await prisma.job.findFirst({ where: { type: "story.render", workspaceId: run.workspaceId, brandId: run.brandId, payload: { path: ["actor", "runId"], equals: run.id } }, select: { id: true } });
  return !!render;
}

/** Called by the runner after a failed attempt. */
export async function onAgentRunFailure(rawPayload: unknown, error: unknown, exhausted: boolean) {
  const parsed = AgentRunJobPayload.safeParse(rawPayload);
  if (!parsed.success) return;
  const { runId } = parsed.data;
  // The message alone: the UI reads it (e.g. "No new drafts…" means nothing to do), so no "Error: " prefix.
  const text = error instanceof Error ? error.message : String(error);
  // A run that finished (its job died before being marked done, then was re-run or reclaimed) stays finished and paid.
  const before = await prisma.agentRun.findUnique({ where: { id: runId }, select: { status: true } });
  if (!before || before.status === "SUCCEEDED") return;
  const run = await prisma.agentRun.update({
    where: { id: runId },
    data: exhausted
      ? { status: "FAILED", finishedAt: new Date(), error: text.slice(0, 2000) }
      : { status: "QUEUED", error: text.slice(0, 2000) },
  });
  // Paid runs (e.g. competitor site audits) get their credits back when they finally fail, unless they already
  // delivered: a re-run of a paid story finds nothing left to do, but the story it wrote is there.
  const chargeId = (run.input as { chargeId?: string } | null)?.chargeId;
  if (exhausted && chargeId && !(await delivered(run))) await refundCharge(run.workspaceId, chargeId);
  await prisma.agentEvent.create({
    data: {
      workspaceId: run.workspaceId,
      brandId: run.brandId,
      runId,
      agentKey: run.agentKey,
      level: error instanceof NothingToDoError ? "INFO" : exhausted ? "ERROR" : "WARN",
      message: error instanceof NothingToDoError
        ? text.slice(0, 300)
        : exhausted
        ? error instanceof Error && error.message === OUT_OF_CREDITS
          ? `Stopped. ${OUT_OF_CREDITS}.`
          : `Failed: ${text.slice(0, 300)}`
        : `Attempt failed, will retry: ${text.slice(0, 300)}`,
    },
  });
}
