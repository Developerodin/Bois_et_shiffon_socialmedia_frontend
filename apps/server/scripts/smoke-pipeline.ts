/**
 * Content pipeline end to end on Neon with the mock AI (no OpenAI calls, no credits needed):
 * scout → shortlist → planner → brief → creator → quality → analyst, plus the fix loop
 * (blocked draft → creator revises → new version → quality passes). Uses a throwaway brand.
 * Run: npm run smoke:pipeline -w web
 */
process.env.OPENAI_API_KEY = ""; // force the mock provider before anything reads it

import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { loadBrandContext } from "@/server/agents/brand-context";
import { getAgent } from "@/server/agents/registry";
import type { AgentContext } from "@/server/agents/types";
import { generateObject } from "@/server/ai/provider";
import { prisma } from "@/server/db/prisma";

async function run(key: string, workspaceId: string, brandId: string) {
  const brand = await loadBrandContext(workspaceId, brandId);
  const lines: string[] = [];
  const ctx: AgentContext = {
    runId: `smoke-${randomUUID()}`,
    brand,
    log: async (level, message) => {
      lines.push(`[${level}] ${message}`);
    },
    ai: { generateObject: ({ workflowId, promptVersion, ...input }) => generateObject({ workspaceId, brandId, workflowId, promptVersion }, input) },
  };
  const out = await getAgent(key)!.run(ctx, {});
  return { out, lines };
}

async function main() {
  const ws = await prisma.workspace.findFirstOrThrow();
  const brand = await prisma.brand.create({ data: { workspaceId: ws.id, slug: `smoke-${Date.now()}`, displayName: "Smoke Meubles", profile: { create: { websiteUrl: "https://example.com" } } } });
  const B = brand.id;
  try {
    // Scout: ranked ideas, deduped on re-run
    let r = await run("scout", ws.id, B);
    const opps = await prisma.opportunity.findMany({ where: { brandId: B } });
    assert.equal(opps.length, 3);
    assert.ok(opps.some((o) => o.decision === "REJECT" && o.reason));
    await run("scout", ws.id, B);
    assert.equal(await prisma.opportunity.count({ where: { brandId: B } }), 3, "re-run must not duplicate");
    console.log(`1 scout: ${opps.length} ideas (${opps.map((o) => o.decision).join(", ")}), re-run deduped ✓`);

    // People shortlist one; the planner only plans shortlisted ideas
    const pick = opps.find((o) => o.decision === "RECOMMEND")!;
    await prisma.opportunity.update({ where: { id: pick.id }, data: { status: "SHORTLISTED" } });
    r = await run("planner", ws.id, B);
    const items = await prisma.contentItem.findMany({ where: { brandId: B }, orderBy: { scheduledFor: "asc" } });
    assert.equal(items.length, 2);
    assert.ok(items.every((i) => i.status === "PLANNED" && i.scheduledFor && i.opportunityId === pick.id));
    assert.equal((await prisma.opportunity.findUniqueOrThrow({ where: { id: pick.id } })).status, "PLANNED");
    console.log(`2 planner: ${items.map((i) => `${i.channel} ${i.scheduledFor!.toISOString().slice(0, 10)}`).join(", ")} ✓`);

    // Brief → creator → quality
    await run("brief", ws.id, B);
    assert.equal(await prisma.contentItem.count({ where: { brandId: B, status: "BRIEF_READY" } }), 2);
    await run("creator", ws.id, B);
    assert.equal(await prisma.contentVersion.count({ where: { item: { brandId: B } } }), 2);
    r = await run("quality", ws.id, B);
    const after = await prisma.contentItem.findMany({ where: { brandId: B }, include: { versions: { include: { checks: true } } } });
    assert.ok(after.every((i) => i.status === "AWAITING_APPROVAL"), `statuses: ${after.map((i) => i.status)}`);
    console.log(`3 brief → creator → quality: 2 drafts, both awaiting approval (${r.lines.filter((l) => l.includes("approval")).length} logged) ✓`);

    // Fix loop: a draft that breaks the rules is blocked, revised by the Creator, then passes
    const target = after[0];
    const bad = { ...(target.versions[0].body as object), hashtags: Array.from({ length: 9 }, (_, i) => `#tag${i}`), caption: "Dans un monde où tout va vite, laissez-vous séduire par une élégance intemporelle, incontournable." };
    await prisma.contentVersion.create({ data: { contentItemId: target.id, version: 2, body: bad, createdBy: "smoke" } });
    await prisma.contentItem.update({ where: { id: target.id }, data: { status: "DRAFT_REVIEW" } });
    await run("quality", ws.id, B);
    const blocked = await prisma.contentVersion.findUniqueOrThrow({ where: { contentItemId_version: { contentItemId: target.id, version: 2 } }, include: { checks: true } });
    assert.equal(blocked.checks[0].overall, "BLOCKER");
    await run("creator", ws.id, B);
    const v3 = await prisma.contentVersion.findUnique({ where: { contentItemId_version: { contentItemId: target.id, version: 3 } } });
    assert.ok(v3, "creator should write v3");
    await run("quality", ws.id, B);
    assert.equal((await prisma.contentItem.findUniqueOrThrow({ where: { id: target.id } })).status, "AWAITING_APPROVAL");
    console.log(`4 fix loop: v2 blocked (${(blocked.checks[0].results as { check: string; status: string }[]).filter((x) => x.status === "blocker").map((x) => x.check).join(", ")}) → creator wrote v3 → passes ✓`);

    // Analyst: honest note without published results
    await run("analyst", ws.id, B);
    const note = await prisma.learningNote.findFirstOrThrow({ where: { brandId: B } });
    assert.match(note.body, /Aucun post publié/);
    console.log(`5 analyst: "${note.title}" ✓`);

    // Nothing to do → clear message, not a silent success
    await assert.rejects(run("brief", ws.id, B), /No planned posts/);
    console.log("6 agents with nothing to do fail with a clear reason ✓");
  } finally {
    await prisma.brand.delete({ where: { id: B } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
