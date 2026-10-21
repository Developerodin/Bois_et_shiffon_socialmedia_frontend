import { randomUUID } from "node:crypto";
import { after } from "next/server";
import {
  AGENT_RUN_JOB,
  executeAgentRun,
  onAgentRunFailure,
  startAgentRun,
} from "@/server/agents/engine";
import { AGENTS } from "@/server/agents/registry";
import { AiProviderError } from "@/server/ai/provider";
import { prisma } from "@/server/db/prisma";
import { EMAIL_SEND_JOB, sendOutboxEmail } from "@/server/email/outbox";
import { claimNextJob, completeJob, enqueueJob, failJob } from "@/server/jobs/queue";

type Handler = {
  run: (payload: unknown) => Promise<void>;
  onFailure?: (payload: unknown, error: unknown, exhausted: boolean) => Promise<void>;
};

export const DAILY_SWEEP_JOB = "system.daily-sweep";

const HANDLERS: Record<string, Handler> = {
  [AGENT_RUN_JOB]: { run: executeAgentRun, onFailure: onAgentRunFailure },
  [DAILY_SWEEP_JOB]: { run: dailySweep },
  [EMAIL_SEND_JOB]: { run: sendOutboxEmail },
};

/**
 * Drains due jobs until none remain or the time budget is spent (design §8b-1).
 * ponytail: sequential, one job at a time; parallelize per brand when volume needs it.
 */
export async function runDueJobs({ budgetMs = 45_000 } = {}) {
  const workerId = `runner-${randomUUID()}`;
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  while (Date.now() < deadline) {
    const job = await claimNextJob(workerId);
    if (!job) break;
    processed++;
    const handler = HANDLERS[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler.run(job.payload);
      await completeJob(job);
    } catch (error) {
      const retryable = !(error instanceof AiProviderError) || error.retryable;
      const exhausted = await failJob(job, error, retryable && Boolean(handler));
      await handler?.onFailure?.(job.payload, error, exhausted).catch(() => {});
    }
  }
  return { processed, workerId };
}

/** Run the queue after the response is sent, so user-triggered work starts immediately. */
export function kickRunner() {
  after(() => runDueJobs().then(() => undefined));
}

/**
 * Daily cron entry: start every scheduled agent for every active brand.
 * The sweep job is unique per day (idempotency key), so a double cron delivery
 * runs it once; a retried sweep skips agents already started today.
 */
async function dailySweep() {
  const scheduled = AGENTS.filter((a) => a.schedule === "daily");
  if (scheduled.length === 0) return;
  const startOfDay = new Date(new Date().toISOString().slice(0, 10));
  const brands = await prisma.brand.findMany({
    where: { status: "ACTIVE" },
    select: { id: true, workspaceId: true },
  });
  for (const brand of brands) {
    for (const agent of scheduled) {
      const already = await prisma.agentRun.count({
        where: {
          brandId: brand.id,
          agentKey: agent.key,
          trigger: "schedule",
          createdAt: { gte: startOfDay },
        },
      });
      if (already > 0) continue;
      await startAgentRun({
        workspaceId: brand.workspaceId,
        brandId: brand.id,
        agentKey: agent.key,
        trigger: "schedule",
      }).catch(() => {}); // disabled for brand → skip
    }
  }
}

export async function enqueueDailySweep() {
  const day = new Date().toISOString().slice(0, 10);
  await enqueueJob({
    type: DAILY_SWEEP_JOB,
    payload: {},
    idempotencyKey: `daily-sweep:${day}`,
  });
}
