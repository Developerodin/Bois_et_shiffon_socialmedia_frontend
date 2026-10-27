import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { NothingToDoError } from "@/server/agents/engine";
import { CONTENT_PROMPT_VERSION, CREATOR_SYSTEM } from "@/server/agents/prompts/content";
import type { AgentDefinition } from "@/server/agents/types";
import { brandKnowledge } from "@/server/content/knowledge";
import { prisma } from "@/server/db/prisma";
import { lock, TX } from "@/server/services/publishing";

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
 * Creator: drafts posts that have a brief, and rewrites drafts the Quality check blocked or an
 * approver sent back (their notes are passed in). Every draft is a new immutable ContentVersion (approval binds to one).
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
      include: {
        versions: { orderBy: { version: "desc" }, take: 1, include: { checks: { orderBy: { createdAt: "desc" }, take: 1 } } },
        decisions: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
    // The approver's "request changes" on the current draft, if that's why it's back here.
    const sentBack = (i: (typeof items)[number]) =>
      i.decisions[0]?.verdict === "CHANGES_REQUESTED" && i.decisions[0].contentVersionId === i.versions[0]?.id ? i.decisions[0].note : null;
    // Fresh briefs, drafts whose latest check found blockers, and drafts an approver sent back.
    // A person's own edit waiting for its check is left alone.
    const todo = items
      .filter((i) => i.status === "BRIEF_READY" || i.versions[0]?.checks[0]?.overall === "BLOCKER" || sentBack(i))
      .slice(0, PER_RUN);
    if (!todo.length) throw new NothingToDoError("Nothing to write: run the Brief writer first (or there are no blocked drafts to fix)");
    const knowledge = await brandKnowledge(brand.workspaceId, brand.brandId, 3500);
    let drafted = 0;

    for (const item of todo) {
      const last = item.versions[0];
      const report = (last?.checks[0]?.results as { check: string; status: string; note: string }[] | undefined)?.filter((r) => r.status !== "pass");
      const reviewer = sentBack(item);
      const out = await ctx.ai.generateObject({
        workflowId: last ? "creator.revise" : "creator.draft",
        promptVersion: CONTENT_PROMPT_VERSION,
        schema: Draft,
        schemaName: "content_draft",
        system: CREATOR_SYSTEM,
        prompt: `Brand: ${brand.displayName}\nChannel: ${item.channel}\nPost: ${item.title}\nBrief: ${JSON.stringify(item.brief)}\n${
          last ? `\nPrevious draft:\n${JSON.stringify(last.body)}\n` : ""
        }${reviewer ? `\nThe approver asked for these changes (do exactly this):\n${reviewer}\n` : ""}${
          report?.length ? `\nQuality report to fix:\n${report.map((r) => `- [${r.status}] ${r.check}: ${r.note}`).join("\n")}\n` : ""
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
      // Writing takes a while: if someone edited, approved or scheduled the post meanwhile, keep their work.
      const saved = await prisma.$transaction(async (tx) => {
        await lock(tx, item.id);
        const now = await tx.contentItem.findUnique({ where: { id: item.id }, select: { status: true, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } } } });
        if (!now || now.status !== item.status || (now.versions[0]?.version ?? 0) !== (last?.version ?? 0)) return false;
        await tx.contentVersion.create({
          data: { contentItemId: item.id, version, body: body as Prisma.InputJsonValue, createdBy: "agent", agentRunId: ctx.runId },
        });
        await tx.contentItem.update({ where: { id: item.id }, data: { status: "DRAFT_REVIEW" } });
        return true;
      }, TX);
      if (saved) drafted++;
      await ctx.log(
        saved ? "SUCCESS" : "WARN",
        saved ? `${last ? "Revised" : "Drafted"} v${version}: ${item.title}` : `Skipped (someone changed it while I was writing): ${item.title}`,
        { type: "ContentItem", id: item.id },
      );
    }
    return { drafted };
  },
};
