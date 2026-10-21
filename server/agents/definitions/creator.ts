import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { CONTENT_PROMPT_VERSION, CREATOR_SYSTEM } from "@/server/agents/prompts/content";
import type { AgentDefinition } from "@/server/agents/types";
import { brandKnowledge } from "@/server/content/knowledge";
import { prisma } from "@/server/db/prisma";

const Draft = z.object({
  hook: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  slides: z.array(z.string()),
  script: z.array(z.string()),
  pinTitle: z.string(),
  altText: z.string(),
});
const PER_RUN = 5;

/**
 * Creator: drafts posts that have a brief, and rewrites drafts the Quality check blocked
 * (its notes are passed in). Every draft is a new immutable ContentVersion (approval binds to one).
 * ponytail: text only; image generation from product photos comes with the Studio (fidelity checks).
 */
export const creatorAgent: AgentDefinition = {
  key: "creator",
  name: "Creator",
  description: "Writes captions, hooks, carousel slides, Reel scripts and Pin titles from each brief.",
  inputSchema: z.object({}).strict(),
  async run(ctx) {
    const { brand } = ctx;
    const items = await prisma.contentItem.findMany({
      where: { brandId: brand.brandId, status: { in: ["BRIEF_READY", "DRAFT_REVIEW"] } },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      include: { versions: { orderBy: { version: "desc" }, take: 1, include: { checks: { orderBy: { createdAt: "desc" }, take: 1 } } } },
    });
    // Fresh briefs, plus drafts whose latest check found blockers.
    const todo = items
      .filter((i) => i.status === "BRIEF_READY" || i.versions[0]?.checks[0]?.overall === "BLOCKER")
      .slice(0, PER_RUN);
    if (!todo.length) throw new Error("Nothing to write: run the Brief writer first (or there are no blocked drafts to fix)");
    const knowledge = await brandKnowledge(brand.workspaceId, brand.brandId, 3500);

    for (const item of todo) {
      const last = item.versions[0];
      const report = last?.checks[0]?.results as { check: string; status: string; note: string }[] | undefined;
      const out = await ctx.ai.generateObject({
        workflowId: last ? "creator.revise" : "creator.draft",
        promptVersion: CONTENT_PROMPT_VERSION,
        schema: Draft,
        schemaName: "content_draft",
        system: CREATOR_SYSTEM,
        prompt: `Brand: ${brand.displayName}\nChannel: ${item.channel}\nPost: ${item.title}\nBrief: ${JSON.stringify(item.brief)}\n${
          last && report ? `\nPrevious draft:\n${JSON.stringify(last.body)}\n\nQuality report to fix:\n${report.filter((r) => r.status !== "pass").map((r) => `- [${r.status}] ${r.check}: ${r.note}`).join("\n")}\n` : ""
        }\nBrand knowledge:\n${knowledge.text}\n\nFill unused fields with "" or []: slides only for carousels, script only for Reels, pinTitle only for Pinterest.`,
        mock: {
          hook: "3 gestes pour garder votre table en bois massif comme neuve",
          caption: "3 gestes pour garder votre table en bois massif comme neuve.\n\nUn dessous-de-plat sous chaque plat chaud. Un chiffon humide, jamais mouillé. Une huile d'entretien deux fois par an.\n\nEnregistrez ce post pour votre prochain entretien.",
          hashtags: ["#boismassif", "#entretienbois"],
          slides: item.channel === "INSTAGRAM_CAROUSEL" ? ["3 gestes pour une table comme neuve", "1. Le dessous-de-plat", "2. Le bon chiffon", "3. L'huile deux fois par an", "Enregistrez pour plus tard"] : [],
          script: item.channel === "INSTAGRAM_REEL" ? ["0-2 s : la table, gros plan", "Geste 1", "Geste 2", "Geste 3", "Enregistrez"] : [],
          pinTitle: item.channel === "PINTEREST_PIN" ? "Entretien table bois massif : 3 gestes simples" : "",
          altText: "Table en bois massif de la marque, plateau huilé, lumière naturelle",
        },
      });
      const body = { ...out, hashtags: out.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)) };
      const version = (last?.version ?? 0) + 1;
      await prisma.$transaction([
        prisma.contentVersion.create({
          data: { contentItemId: item.id, version, body: body as Prisma.InputJsonValue, createdBy: "agent", agentRunId: ctx.runId },
        }),
        prisma.contentItem.update({ where: { id: item.id }, data: { status: "DRAFT_REVIEW" } }),
      ]);
      await ctx.log("SUCCESS", `${last ? "Revised" : "Drafted"} v${version}: ${item.title}`, { type: "ContentItem", id: item.id });
    }
    return { drafted: todo.length };
  },
};
