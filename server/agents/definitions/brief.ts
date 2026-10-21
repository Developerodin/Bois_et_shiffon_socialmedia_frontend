import { z } from "zod";
import { BRIEF_SYSTEM, CONTENT_PROMPT_VERSION } from "@/server/agents/prompts/content";
import type { AgentDefinition } from "@/server/agents/types";
import { brandKnowledge } from "@/server/content/knowledge";
import { prisma } from "@/server/db/prisma";

export const Brief = z.object({
  goal: z.enum(["awareness", "saves", "traffic", "community", "sales"]),
  audience: z.string(),
  keyMessage: z.string(),
  products: z.array(z.string()),
  cta: z.string(),
  visual: z.string(),
  questions: z.array(z.string()),
});
const PER_RUN = 8;

/** Brief writer: each PLANNED post gets a production brief → BRIEF_READY. */
export const briefAgent: AgentDefinition = {
  key: "brief",
  name: "Brief writer",
  description: "Writes a production brief for each planned post: goal, audience, message, products, call to action.",
  inputSchema: z.object({}).strict(),
  async run(ctx) {
    const { brand } = ctx;
    const items = await prisma.contentItem.findMany({
      where: { brandId: brand.brandId, status: "PLANNED" },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      take: PER_RUN,
      include: { opportunity: { select: { title: true, summary: true, angle: true, reason: true } } },
    });
    if (!items.length) throw new Error("No planned posts waiting for a brief: run the Planner first");
    const knowledge = await brandKnowledge(brand.workspaceId, brand.brandId, 3000);

    for (const item of items) {
      const prior = (item.brief ?? {}) as Record<string, unknown>;
      const out = await ctx.ai.generateObject({
        workflowId: "brief.write",
        promptVersion: CONTENT_PROMPT_VERSION,
        schema: Brief,
        schemaName: "content_brief",
        system: BRIEF_SYSTEM,
        prompt: `Brand: ${brand.displayName}\nPost: ${item.title}\nChannel: ${item.channel}\nPillar: ${item.pillar ?? "-"}\nDate: ${item.scheduledFor?.toISOString().slice(0, 10) ?? "unscheduled"}\nAngle: ${String(prior.angle ?? "")}\nIdea: ${item.opportunity ? `${item.opportunity.title}. ${item.opportunity.summary} Why now: ${item.opportunity.reason}` : "-"}\n\nBrand knowledge:\n${knowledge.text}`,
        mock: {
          goal: "saves",
          audience: "Couples aménageant leur salon ou salle à manger, sensibles au bois massif",
          keyMessage: "Un meuble en bois massif dure des années avec quelques gestes simples.",
          products: [],
          cta: "Enregistrez ce post pour votre prochain entretien.",
          visual: "Photo produit de la marque en lumière naturelle, gros plan sur le grain du bois.",
          questions: ["Quels produits mettre en avant ?"],
        },
      });
      // Only if it's still waiting for a brief: someone may have written the draft meanwhile.
      const { count } = await prisma.contentItem.updateMany({ where: { id: item.id, status: "PLANNED" }, data: { brief: { ...prior, ...out }, status: "BRIEF_READY" } });
      await ctx.log(count ? "SUCCESS" : "WARN", count ? `Brief ready: ${item.title}` : `Skipped (it moved on while I was writing): ${item.title}`, { type: "ContentItem", id: item.id });
    }
    return { briefed: items.length };
  },
};
