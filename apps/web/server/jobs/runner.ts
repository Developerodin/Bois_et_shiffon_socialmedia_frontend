import { randomUUID } from "node:crypto";
import { after } from "next/server";
import {
  AGENT_RUN_JOB,
  executeAgentRun,
  NothingToDoError,
  onAgentRunFailure,
  startAgentRun,
} from "@/server/agents/engine";
import { AGENTS } from "@/server/agents/registry";
import { AiProviderError } from "@/server/ai/provider";
import { prisma } from "@/server/db/prisma";
import { EMAIL_SEND_JOB, sendOutboxEmail } from "@/server/email/outbox";
import { claimNextJob, completeJob, enqueueJob, failJob, holdLease } from "@/server/jobs/queue";
import { refreshExpiringTokens } from "@/server/services/connections";
import { executePublication, onPublishJobLost, PUBLISH_JOB } from "@/server/services/publishing";

type Handler = {
  run: (payload: unknown) => Promise<void>;
  onFailure?: (payload: unknown, error: unknown, exhausted: boolean) => Promise<void>;
};

export const DAILY_SWEEP_JOB = "system.daily-sweep";

const HANDLERS: Record<string, Handler> = {
  [AGENT_RUN_JOB]: { run: executeAgentRun, onFailure: onAgentRunFailure },
  [DAILY_SWEEP_JOB]: { run: dailySweep },
  [EMAIL_SEND_JOB]: { run: sendOutboxEmail },
  [PUBLISH_JOB]: { run: executePublication, onFailure: onPublishJobLost },
};

/**
 * Drains due jobs until none remain or the time budget is spent (design §8b-1). The budget is only
 * checked between jobs, so callers leave headroom under maxDuration (300 s) for one long job.
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
    // Reclaimed after its last attempt died mid-run (timeout, crash): stop here instead of looping forever.
    if (job.attempts > job.maxAttempts) {
      const error = new Error("Stopped: it was cut off before finishing on every attempt");
      await failJob(job, error, false);
      await handler?.onFailure?.(job.payload, error, true).catch(() => {});
      continue;
    }
    const release = holdLease(job);
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      await handler.run(job.payload);
      await completeJob(job);
    } catch (error) {
      const retryable = error instanceof AiProviderError ? error.retryable : !(error instanceof NothingToDoError);
      const exhausted = await failJob(job, error, retryable && Boolean(handler));
      await handler?.onFailure?.(job.payload, error, exhausted).catch(() => {});
    } finally {
      release();
    }
  }
  return { processed, workerId };
}

/** Run the queue after the response is sent, so user-triggered work starts immediately. */
export function kickRunner() {
  after(() => runDueJobs().then(() => undefined));
}

let lastDueCheck = 0;
/**
 * Called from routes the open app polls: if a job is overdue (a scheduled post, an agent retry),
 * run it now instead of waiting for the cron. At most one check per 30 s per server instance.
 * ponytail: only runs while someone has the app open; a frequent cron (see docs/ENV_SETUP.md) covers idle hours.
 */
export async function kickIfDue() {
  if (Date.now() - lastDueCheck < 30_000) return;
  lastDueCheck = Date.now();
  const due = await prisma.job.findFirst({
    where: { OR: [{ status: "PENDING", runAt: { lte: new Date() } }, { status: "RUNNING", leasedUntil: { lt: new Date() } }] },
    select: { id: true },
  });
  if (due) kickRunner();
}

/**
 * Daily cron entry: start every scheduled agent for every active brand.
 * The sweep job is unique per day (idempotency key), so a double cron delivery
 * runs it once; a retried sweep skips agents already started today.
 */
async function dailySweep() {
  await refreshExpiringTokens();
  await pruneOldRows();
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

/** Housekeeping: rows that only matter for a while. Audit events, decisions and AI usage are kept. */
async function pruneOldRows() {
  const ago = (days: number) => new Date(Date.now() - days * 86_400_000);
  await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: ago(2) } } });
  await prisma.oAuthStateTransaction.deleteMany({ where: { expiresAt: { lt: ago(2) } } });
  await prisma.job.deleteMany({ where: { status: "COMPLETED", updatedAt: { lt: ago(30) } } });
  await prisma.emailOutbox.deleteMany({ where: { status: { in: ["SENT", "NOT_CONFIGURED"] }, createdAt: { lt: ago(30) } } });
  await prisma.agentEvent.deleteMany({ where: { createdAt: { lt: ago(90) } } });
  await prisma.pageView.deleteMany({ where: { createdAt: { lt: ago(180) } } });
}

export async function enqueueDailySweep() {
  const day = new Date().toISOString().slice(0, 10);
  await enqueueJob({
    type: DAILY_SWEEP_JOB,
    payload: {},
    idempotencyKey: `daily-sweep:${day}`,
  });
}
