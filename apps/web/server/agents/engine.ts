import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { loadBrandContext } from "@/server/agents/brand-context";
import { getAgent } from "@/server/agents/registry";
import type { AgentContext } from "@/server/agents/types";
import { generateObject } from "@/server/ai/provider";
import { prisma } from "@/server/db/prisma";
import { validateAiWorkflowPayload } from "@/server/jobs/claim";
import { enqueueJob } from "@/server/jobs/queue";

export const AGENT_RUN_JOB = "agent.run";

export class AgentStartError extends Error {
  constructor(
    message: string,
    readonly status: 404 | 409 | 422,
  ) {
    super(message);
    this.name = "AgentStartError";
  }
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

  return prisma.$transaction(async (tx) => {
    const run = await tx.agentRun.create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        agentKey: agent.key,
        trigger: input.trigger,
        triggeredByUserId: input.userId,
        input: parsed.data as Prisma.InputJsonValue,
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
  });
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
    log,
    ai: {
      generateObject: ({ workflowId, promptVersion, ...input }) =>
        generateObject(
          {
            workspaceId: run.workspaceId,
            brandId: run.brandId,
            agentRunId: run.id,
            workflowId,
            promptVersion,
          },
          input,
        ),
    },
  };

  const output = await agent.run(ctx, agent.inputSchema.parse(run.input ?? {}));
  await prisma.agentRun.update({
    where: { id: run.id },
    data: { status: "SUCCEEDED", finishedAt: new Date(), output: output ?? undefined },
  });
  await log("SUCCESS", `${agent.name} finished`);
}

/** Called by the runner after a failed attempt. */
export async function onAgentRunFailure(rawPayload: unknown, error: unknown, exhausted: boolean) {
  const parsed = AgentRunJobPayload.safeParse(rawPayload);
  if (!parsed.success) return;
  const { runId } = parsed.data;
  const run = await prisma.agentRun.update({
    where: { id: runId },
    data: exhausted
      ? { status: "FAILED", finishedAt: new Date(), error: String(error).slice(0, 2000) }
      : { status: "QUEUED", error: String(error).slice(0, 2000) },
  });
  await prisma.agentEvent.create({
    data: {
      workspaceId: run.workspaceId,
      brandId: run.brandId,
      runId,
      agentKey: run.agentKey,
      level: exhausted ? "ERROR" : "WARN",
      message: exhausted
        ? `Failed: ${String(error).slice(0, 300)}`
        : `Attempt failed, will retry: ${String(error).slice(0, 300)}`,
    },
  });
}
