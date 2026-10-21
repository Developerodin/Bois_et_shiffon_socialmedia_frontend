/**
 * Competitor audits on Neon with the mock AI (no OpenAI credits needed; PageSpeed/crawl are real):
 * discovery → paid fresh audit (credits, lock, no double charge while running) → shared library
 * seen by another workspace without the requester → refund on failure → insufficient credits.
 * Uses throwaway workspaces/brands. Run: npm run smoke:competitors -w web
 */
process.env.OPENAI_API_KEY = ""; // mock AI before anything reads it

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadBrandContext } from "@/server/agents/brand-context";
import { executeAgentRun, onAgentRunFailure } from "@/server/agents/engine";
import { getAgent } from "@/server/agents/registry";
import { generateObject } from "@/server/ai/provider";
import { prisma } from "@/server/db/prisma";
import { listCompetitors, startCompetitorAudit } from "@/server/services/competitor-audits";
import { creditBalance, CREDIT_COSTS, spendCredits, STARTER_CREDITS } from "@/server/services/credits";

async function makeBrand(label: string, site: string) {
  const ws = await prisma.workspace.create({ data: { name: `Smoke ${label}`, slug: `smoke-${label}-${Date.now()}` } });
  const brand = await prisma.brand.create({ data: { workspaceId: ws.id, slug: "b", displayName: `Smoke ${label}`, profile: { create: { websiteUrl: site } } } });
  return { ws: ws.id, brand: brand.id };
}

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: process.env.SEED_ADMIN_EMAIL!.toLowerCase() } });
  const A = await makeBrand("a", "https://www.tikamoon.com"); // the brand's own site must never become a competitor
  const B = await makeBrand("b", "https://shop-b.example.org");
  try {
    // 1. Discovery (mock returns Tikamoon + Maisons du Monde; Tikamoon is A's own domain)
    const brandA = await loadBrandContext(A.ws, A.brand);
    await getAgent("competitors")!.run(
      { runId: `smoke-${randomUUID()}`, brand: brandA, log: async () => {}, ai: { generateObject: ({ workflowId, promptVersion, ...i }) => generateObject({ workspaceId: A.ws, brandId: A.brand, workflowId, promptVersion }, i) } },
      {},
    );
    const found = await prisma.competitor.findMany({ where: { brandId: A.brand } });
    assert.deepEqual(found.map((c) => c.domain).sort(), ["maisonsdumonde.com"]);
    console.log("1 discovery: maisonsdumonde.com added, the brand's own domain skipped ✓");

    // 2. Paid fresh audit of a fast public site; no second charge while it runs
    const target = await prisma.competitor.create({ data: { workspaceId: A.ws, brandId: A.brand, name: "Example", domain: "example.com", source: "manual" } });
    assert.equal(await creditBalance(A.ws), STARTER_CREDITS);
    const first = await startCompetitorAudit({ workspaceId: A.ws, brandId: A.brand, userId: user.id, competitorId: target.id });
    const second = await startCompetitorAudit({ workspaceId: A.ws, brandId: A.brand, userId: user.id, competitorId: target.id });
    assert.equal(first.status, "started");
    assert.equal(second.status, "already-running");
    assert.equal(await creditBalance(A.ws), STARTER_CREDITS - CREDIT_COSTS.siteAudit);
    console.log(`2 fresh audit charged ${CREDIT_COSTS.siteAudit} credits once; a second click while running is free ✓`);

    const run = await prisma.agentRun.findFirstOrThrow({ where: { workspaceId: A.ws, agentKey: "site-audit" } });
    await executeAgentRun({ workspaceId: A.ws, brandId: A.brand, runId: run.id });
    const audit = await prisma.siteAudit.findFirstOrThrow({ where: { agentRunId: run.id } });
    console.log(`3 audit saved for ${audit.domain}: site checks ${(audit.scores as { siteChecks: number }).siteChecks}/100, PageSpeed perf ${(audit.scores as { performance: number | null }).performance ?? "n/a"} ✓`);

    // 4. Another customer tracking the same domain sees it from the library, dated, without the requester
    await prisma.competitor.create({ data: { workspaceId: B.ws, brandId: B.brand, name: "Example", domain: "example.com", source: "manual" } });
    const viewB = await listCompetitors(B.ws, B.brand);
    const shared = viewB.competitors[0].audit!;
    assert.equal(shared.id, audit.id);
    assert.ok(!("requestedByWorkspaceId" in shared) && !("agentRunId" in shared));
    assert.equal(viewB.credits.balance, STARTER_CREDITS, "B paid nothing");
    console.log(`4 another workspace sees the shared audit (checked ${shared.createdAt.slice(0, 10)}, stale=${shared.stale}), requester hidden, no charge ✓`);

    // 5. A run that finally fails refunds its charge, exactly once
    const bad = await prisma.competitor.create({ data: { workspaceId: A.ws, brandId: A.brand, name: "Broken", domain: "unreachable.invalid", source: "manual" } });
    await startCompetitorAudit({ workspaceId: A.ws, brandId: A.brand, userId: user.id, competitorId: bad.id });
    const badRun = await prisma.agentRun.findFirstOrThrow({ where: { workspaceId: A.ws, agentKey: "site-audit", input: { path: ["domain"], equals: "unreachable.invalid" } } });
    const before = await creditBalance(A.ws);
    await onAgentRunFailure({ workspaceId: A.ws, brandId: A.brand, runId: badRun.id }, new Error("Could not read"), true);
    await onAgentRunFailure({ workspaceId: A.ws, brandId: A.brand, runId: badRun.id }, new Error("Could not read"), true);
    assert.equal(await creditBalance(A.ws), before + CREDIT_COSTS.siteAudit);
    console.log("5 failed audit refunded once (second failure report doesn't refund again) ✓");

    // 6. Concurrent spends can't overdraw: 5 at once with room for exactly 3
    const balance = await creditBalance(B.ws);
    await spendCredits({ workspaceId: B.ws, amount: balance - 30, reason: "smoke", userId: user.id });
    const results = await Promise.allSettled(Array.from({ length: 5 }, () => spendCredits({ workspaceId: B.ws, amount: 10, reason: "smoke", userId: user.id })));
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 3);
    assert.equal(await creditBalance(B.ws), 0);
    const broke = await startCompetitorAudit({ workspaceId: B.ws, brandId: B.brand, userId: user.id, competitorId: (await prisma.competitor.findFirstOrThrow({ where: { brandId: B.brand } })).id });
    assert.equal(broke.status, "insufficient-credits");
    console.log("6 five simultaneous spends with room for three → three succeed, balance 0, next audit refused ✓");
  } finally {
    const runs = await prisma.agentRun.findMany({ where: { workspaceId: { in: [A.ws, B.ws] } }, select: { id: true } });
    await prisma.siteAudit.deleteMany({ where: { agentRunId: { in: runs.map((r) => r.id) } } });
    await prisma.job.deleteMany({ where: { workspaceId: { in: [A.ws, B.ws] } } });
    await prisma.workspace.deleteMany({ where: { id: { in: [A.ws, B.ws] } } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
