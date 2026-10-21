/**
 * Live Slice 0 check against the linked Neon branch (real Postgres guarantees):
 *  1. composite tenant FK rejects a row whose workspaceId doesn't own its brandId (AT-021)
 *  2. concurrent claims of one job → exactly one winner (AT-007)
 *  3. agent pipeline: start → job → runner → AI (mock or OpenAI) → Agent Log → SUCCEEDED
 * Run: npm run smoke:agents -w web   (cleans up after itself)
 */
import assert from "node:assert/strict";
import { prisma } from "@/server/db/prisma";
import { startAgentRun } from "@/server/agents/engine";
import { claimNextJob, completeJob, enqueueJob } from "@/server/jobs/queue";
import { runDueJobs } from "@/server/jobs/runner";

async function main() {
  const brand = await prisma.brand.findFirstOrThrow({ where: { status: "ACTIVE" } });
  const otherWs = await prisma.workspace.create({
    data: { name: "smoke-other", slug: `smoke-${Date.now()}` },
  });

  try {
    // 1. composite FK
    await assert.rejects(
      prisma.agentRun.create({
        data: { workspaceId: otherWs.id, brandId: brand.id, agentKey: "x", trigger: "manual" },
      }),
      /Foreign key constraint/i,
    );
    console.log("1 composite tenant FK: cross-workspace row rejected ✓");

    // 2. concurrent claim
    const job = await enqueueJob({
      type: "smoke.noop",
      workspaceId: brand.workspaceId,
      brandId: brand.id,
      payload: {},
      idempotencyKey: `smoke-claim-${Date.now()}`,
    });
    const claims = await Promise.all(
      Array.from({ length: 5 }, (_, i) => claimNextJob(`smoke-${i}`)),
    );
    const winners = claims.filter((c) => c?.id === job.id);
    assert.equal(winners.length, 1, `expected 1 winner, got ${winners.length}`);
    await completeJob(winners[0]!);
    for (const c of claims) if (c && c.id !== job.id) await prisma.job.update({ where: { id: c.id }, data: { status: "PENDING", leasedBy: null, leasedUntil: null, attempts: { decrement: 1 } } });
    await prisma.job.delete({ where: { id: job.id } });
    console.log("2 concurrent claim: 5 runners, exactly 1 winner ✓");

    // 3. agent pipeline
    const run = await startAgentRun({
      workspaceId: brand.workspaceId,
      brandId: brand.id,
      agentKey: "systems-check",
      trigger: "manual",
    });
    const result = await runDueJobs({ budgetMs: 60_000 });
    const done = await prisma.agentRun.findUniqueOrThrow({ where: { id: run.id } });
    const events = await prisma.agentEvent.findMany({ where: { runId: run.id }, orderBy: { id: "asc" } });
    const ai = await prisma.aiWorkflowRun.findFirst({ where: { agentRunId: run.id } });
    assert.equal(done.status, "SUCCEEDED", `run ${done.status}: ${done.error}`);
    assert.ok(events.length >= 4, "expected agent log events");
    console.log(`3 agent pipeline: ${done.status}, ${events.length} log events, AI=${ai?.provider}/${ai?.model} ✓ (runner processed ${result.processed})`);
    for (const e of events) console.log(`   [${e.level}] ${e.message}`);
  } finally {
    await prisma.workspace.delete({ where: { id: otherWs.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
