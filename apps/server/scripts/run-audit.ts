/**
 * Dev tool: run the SEO or GEO agent against any URL for the seeded brand, without the job queue
 * and without changing the brand's saved website. Saves a real AuditReport.
 * Run: npm run audit -w web -- seo https://www.example.com
 */
import { randomUUID } from "node:crypto";
import { loadBrandContext } from "@/server/agents/brand-context";
import { getAgent } from "@/server/agents/registry";
import type { AgentContext } from "@/server/agents/types";
import { generateObject } from "@/server/ai/provider";
import { prisma } from "@/server/db/prisma";

async function main() {
  const [key, url] = process.argv.slice(2);
  const agent = getAgent(key);
  if (!agent || !url) throw new Error("usage: run-audit <seo|geo> <url>");
  const b = await prisma.brand.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  const brand = { ...(await loadBrandContext(b.workspaceId, b.id)), websiteUrl: url };
  const ctx: AgentContext = {
    runId: `dev-${randomUUID()}`,
    brand,
    log: async (level, message) => console.log(`[${level}] ${message}`),
    ai: {
      generateObject: ({ workflowId, promptVersion, ...input }) =>
        generateObject({ workspaceId: brand.workspaceId, brandId: brand.brandId, workflowId, promptVersion }, input),
    },
  };
  const started = Date.now();
  console.log(JSON.stringify(await agent.run(ctx, {})), `in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
