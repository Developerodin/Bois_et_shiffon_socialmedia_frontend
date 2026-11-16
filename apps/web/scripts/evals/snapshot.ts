/**
 * Freezes the test set's real inputs into fixtures.json, so the cases don't change when live data does: the
 * Bois & Chiffons homepage and pages (public website), its brand knowledge and strategy documents, one real brief
 * and draft. Re-run only to refresh the inputs on purpose (then re-run the evals to get a new baseline).
 * Run: npx tsx --conditions=react-server --env-file=.env scripts/evals/snapshot.ts
 */
import { writeFileSync } from "node:fs";
import { brandKnowledge } from "@/server/content/knowledge";
import { prisma } from "@/server/db/prisma";
import { crawlSite } from "@/server/research/crawl";
import { listContextDocs } from "@/server/services/context-docs";

const WS = "cmvhqkx8h0001v630qd3rb7gb";
const BRAND = "cmvq92o220002v6hki2z917ww"; // Bois & Chiffons, the seeded first client
const SITE = "https://www.boisetchiffons.fr";

(async () => {
  const { pages } = await crawlSite(SITE);
  const docs = await listContextDocs(WS, BRAND);
  const item = await prisma.contentItem.findFirstOrThrow({
    where: { brandId: BRAND, versions: { some: {} } },
    orderBy: { createdAt: "desc" },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const fixtures = {
    capturedAt: new Date().toISOString(),
    brand: { name: "Bois & Chiffons", website: SITE },
    pages: pages.map((p) => ({ url: p.url, title: p.title, description: p.description, text: p.text })),
    docs: docs.map((d) => ({ title: d.title, markdown: d.latest?.markdown ?? null })),
    knowledge: { creator: (await brandKnowledge(WS, BRAND, 3500)).text, quality: (await brandKnowledge(WS, BRAND, 4000)).text, scout: (await brandKnowledge(WS, BRAND)).text },
    post: { channel: item.channel, title: item.title, brief: item.brief, draft: item.versions[0].body },
  };
  writeFileSync("scripts/evals/fixtures.json", JSON.stringify(fixtures, null, 1));
  console.log(`fixtures.json: ${pages.length} pages, ${docs.length} documents, post "${item.title}" (${item.channel})`);
})().finally(() => prisma.$disconnect());
