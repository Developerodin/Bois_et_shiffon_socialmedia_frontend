/**
 * Live Slice 1 check on Neon: create brand → Research agent crawls the site →
 * five DRAFT docs → confirm / edit / stale-edit / stale-confirm rules.
 * Uses a throwaway brand (deleted after). Run: npm run smoke:research -w web [url]
 */
import assert from "node:assert/strict";
import { prisma } from "@/server/db/prisma";
import { runDueJobs } from "@/server/jobs/runner";
import { BrandAssets } from "@/server/research/brand-assets";
import { deleteMedia } from "@/server/storage/media";
import { createBrandWithResearch } from "@/server/services/create-brand";
import {
  confirmDoc,
  confirmedContext,
  ContextDocConflictError,
  listContextDocs,
  saveDraft,
} from "@/server/services/context-docs";

async function main() {
  const url = process.argv[2] ?? "https://example.com";
  const owner = await prisma.workspaceMember.findFirstOrThrow({ where: { role: "OWNER" } });
  const { brand, researchRunId } = await createBrandWithResearch(owner.workspaceId, owner.userId, {
    displayName: `Smoke ${Date.now()}`,
    websiteUrl: url,
  });
  const ws = owner.workspaceId;
  try {
    await runDueJobs({ budgetMs: 240_000 });
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: researchRunId } });
    const events = await prisma.agentEvent.findMany({ where: { runId: run.id }, orderBy: { id: "asc" } });
    for (const e of events) console.log(`   [${e.level}] ${e.message}`);
    assert.equal(run.status, "SUCCEEDED", `research ${run.status}: ${run.error}`);

    const docs = await listContextDocs(ws, brand.id);
    assert.equal(docs.filter((d) => d.latest?.status === "DRAFT").length, 5, "five drafts");
    assert.ok(docs.every((d) => (d.latest?.sources.length ?? 0) > 0), "every doc cites sources");
    console.log("1 research: 5 draft docs with sources ✓");

    const assets = BrandAssets.safeParse((await prisma.brandProfile.findUnique({ where: { brandId: brand.id } }))?.assets).data;
    console.log(`  assets: ${JSON.stringify(assets && { ...assets, products: assets.products.map((p) => `${p.title} [${p.imageKey ? "photo" : "no photo"}]`) }, null, 1)}`);

    await confirmDoc({ workspaceId: ws, brandId: brand.id, kind: "brand-voice", version: 1, userId: owner.userId });
    await saveDraft({ workspaceId: ws, brandId: brand.id, kind: "brand-voice", markdown: "## Voice v2", baseVersion: 1, userId: owner.userId });
    const ctx = await confirmedContext(ws, brand.id);
    assert.ok(ctx["brand-voice"] && !ctx["brand-voice"].includes("Voice v2"), "agents still see confirmed v1");
    console.log("2 confirm v1, edit → v2 draft, agents still read v1 ✓");

    await assert.rejects(
      saveDraft({ workspaceId: ws, brandId: brand.id, kind: "brand-voice", markdown: "stale", baseVersion: 1, userId: owner.userId }),
      ContextDocConflictError,
    );
    await assert.rejects(
      confirmDoc({ workspaceId: ws, brandId: brand.id, kind: "brand-voice", version: 1, userId: owner.userId }),
      ContextDocConflictError,
    );
    console.log("3 stale edit and stale confirm rejected ✓");
  } finally {
    const stored = BrandAssets.safeParse((await prisma.brandProfile.findUnique({ where: { brandId: brand.id } }))?.assets).data;
    for (const key of [stored?.logo?.key, ...(stored?.products ?? []).map((p) => p.imageKey)]) if (key) await deleteMedia(key).catch(() => undefined);
    // Brand creation also queues SEO and GEO: drop their jobs too, or the runner later trips over runs that are gone.
    await prisma.job.deleteMany({ where: { brandId: brand.id } });
    await prisma.brand.delete({ where: { id: brand.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
