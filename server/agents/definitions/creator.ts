import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { CHAIN_ROUNDS } from "@/server/agents/chain";
import { NothingToDoError, startAgentRun } from "@/server/agents/engine";
import { CONTENT_PROMPT_VERSION, CREATOR_SYSTEM } from "@/server/agents/prompts/content";
import type { AgentDefinition } from "@/server/agents/types";
import { answeredBy } from "@/server/ai/provider";
import { brandKnowledge, productPhotos } from "@/server/content/knowledge";
import { checkDraft } from "@/server/content/rules";
import { prisma } from "@/server/db/prisma";
import { lock, postAiAllowed, TX } from "@/server/services/publishing";

export const Draft = z.object({
  hook: z.string(),
  caption: z.string(),
  hashtags: z.array(z.string()),
  slides: z.array(z.string()),
  script: z.array(z.string()),
  pinTitle: z.string(),
  altText: z.string(),
  photoKeys: z.array(z.string()),
});
const PER_RUN = 5;

/**
 * Creator: drafts posts that have a brief, and rewrites drafts the Quality check blocked or an
 * approver sent back (their notes are passed in). Every draft is a new immutable ContentVersion (approval binds to one).
 * The pictures are the brand's own product photos (photoKeys, the first is the cover), which the person can swap on the edit screen.
 * ponytail: no image generation; that comes with the Studio (fidelity checks).
 */
export const creatorAgent: AgentDefinition = {
  key: "creator",
  name: "Creator",
  description: "Writes captions, hooks, carousel slides, Reel scripts and Pin titles from each brief.",
  // itemId: write just that post (sent back from the app's "Re-generate caption"), as its own run.
  // chain: start the next agent of the posts chain when done (Planner → Brief writer → Creator → Quality), the app's "Generate calendar".
  inputSchema: z.object({ itemId: z.string().min(1).max(100).optional(), chain: z.boolean().optional(), round: z.number().int().min(0).max(CHAIN_ROUNDS).optional() }).strict(),
  async run(ctx, input) {
    const { brand } = ctx;
    const { itemId, chain, round = 0 } = input as { itemId?: string; chain?: boolean; round?: number }; // parsed by the engine against inputSchema
    const items = await prisma.contentItem.findMany({
      // studio reels are written in the app
      where: { brandId: brand.brandId, status: { in: ["BRIEF_READY", "DRAFT_REVIEW"] }, studio: false, ...(itemId ? { id: itemId } : {}) },
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
    // New briefs first, so drafts the check keeps blocking can't take every slot and starve the new posts.
    const todo = items
      .filter((i) => i.status === "BRIEF_READY" || i.versions[0]?.checks[0]?.overall === "BLOCKER" || sentBack(i))
      .sort((a, b) => Number(b.status === "BRIEF_READY") - Number(a.status === "BRIEF_READY"))
      .slice(0, PER_RUN);
    if (!todo.length) throw new NothingToDoError("Nothing to write: run the Brief writer first (or there are no blocked drafts to fix)");
    const [knowledge, photos] = await Promise.all([brandKnowledge(brand.workspaceId, brand.brandId, 3500), productPhotos(brand.workspaceId, brand.brandId)]);
    const keys = new Set(photos.map((p) => p.key));
    const photoList = photos.length ? photos.map((p) => `- ${p.key} | ${p.title}`).join("\n") : "(none yet)";
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
        // Brand knowledge first: it's the same for every post in this run, so OpenAI can bill it at the cached rate.
        prompt: `Brand: ${brand.displayName}\n\nBrand knowledge:\n${knowledge.text}\n\n---\nThe post to write\nChannel: ${item.channel}\nPost: ${item.title.replace(/\s+/g, " ")}\nBrief: ${JSON.stringify(item.brief)}\n${
          last ? `\nPrevious draft:\n${JSON.stringify(last.body)}\n` : ""
        }${reviewer ? `\nThe approver asked for these changes (do exactly this):\n${reviewer}\n` : ""}${
          report?.length ? `\nQuality report to fix:\n${report.map((r) => `- [${r.status}] ${r.check}: ${r.note}`).join("\n")}\n` : ""
        }\nBrand photos (key | product):\n${photoList}\nphotoKeys: exact keys of the photos that show this post's product: 1 for single-image posts and Pins, 2 to 10 for carousels (one per slide where you can), [] when none fits or for Threads and Reels.\nFill unused fields with "" or []: slides only for carousels, script only for Reels, pinTitle only for Pinterest.`,
        // Our own hard rules (length, hashtags, slides…): a draft that breaks one is asked again with the reasons
        // (Creator is already the top tier, so the same model rewrites it); if it still breaks one, Quality blocks it.
        validate: (d) => {
          const blockers = checkDraft(item.channel, d).filter((r) => r.status === "blocker").map((r) => `${r.check}: ${r.note}`);
          if (d.photoKeys.some((k) => !keys.has(k))) blockers.push("photoKeys: use only the listed keys, exactly");
          return blockers.length ? blockers.join("; ") : null;
        },
        mock: {
          hook: "3 gestes pour garder votre table en bois massif comme neuve",
          caption: "3 gestes pour garder votre table en bois massif comme neuve.\n\nUn dessous-de-plat sous chaque plat chaud. Un chiffon humide, jamais mouillé. Une huile d'entretien deux fois par an.\n\nEnregistrez ce post pour votre prochain entretien.",
          hashtags: ["#boismassif", "#entretienbois"],
          slides: item.channel === "INSTAGRAM_CAROUSEL" ? ["3 gestes pour une table comme neuve", "1. Le dessous-de-plat", "2. Le bon chiffon", "3. L'huile deux fois par an", "Enregistrez pour plus tard"] : [],
          script: item.channel === "INSTAGRAM_REEL" ? ["0-2 s : la table, gros plan", "Geste 1", "Geste 2", "Geste 3", "Enregistrez"] : [],
          pinTitle: item.channel === "PINTEREST_PIN" ? "Entretien table bois massif : 3 gestes simples" : "",
          altText: "Table en bois massif de la marque, plateau huilé, lumière naturelle",
          photoKeys: photos.slice(0, item.channel === "INSTAGRAM_CAROUSEL" ? 3 : 1).map((p) => p.key),
        },
      });
      // Photos the person already has on the draft (an edit) or picked in the app (P06) stay first; the writer may add more to a carousel.
      const own = (last?.body as { photoKeys?: string[] } | undefined)?.photoKeys ?? (item.brief as { photoKeys?: string[] } | null)?.photoKeys ?? [];
      // (an upload on an earlier draft isn't among the product photos, but it stays the person's choice)
      const chosen = own.filter((k) => keys.has(k) || !!last);
      const max = item.channel === "INSTAGRAM_CAROUSEL" ? 10 : item.channel === "THREADS_POST" || item.channel === "INSTAGRAM_REEL" ? 0 : 1;
      const photoKeys = [...new Set([...chosen, ...out.photoKeys])].slice(0, max);
      const body = { ...out, photoKeys, hashtags: out.hashtags.map((h) => (h.startsWith("#") ? h : `#${h}`)) };
      const version = (last?.version ?? 0) + 1;
      // Writing takes a while: if someone edited, approved or scheduled the post meanwhile, keep their work.
      const saved = await prisma.$transaction(async (tx) => {
        await lock(tx, item.id);
        const now = await tx.contentItem.findUnique({ where: { id: item.id }, select: { status: true, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true } } } });
        if (!now || now.status !== item.status || (now.versions[0]?.version ?? 0) !== (last?.version ?? 0)) return false;
        await tx.contentVersion.create({
          data: { contentItemId: item.id, version, body: body as Prisma.InputJsonValue, createdBy: "agent", agentRunId: ctx.runId, model: answeredBy(out)?.model },
        });
        await tx.contentItem.update({ where: { id: item.id }, data: { status: "DRAFT_REVIEW" } });
        return true;
      }, TX);
      if (saved) drafted++;
      // Asked for from the app (one post): check it now too, so it's ready to approve in a minute, not tomorrow.
      if (saved && itemId) await startAgentRun({ workspaceId: brand.workspaceId, brandId: brand.brandId, agentKey: "quality", trigger: "event", input: { itemId, version } }).catch(() => null);
      await ctx.log(
        saved ? "SUCCESS" : "WARN",
        saved ? `${last ? "Revised" : "Drafted"} v${version}: ${item.title}` : `Skipped (someone changed it while I was writing): ${item.title}`,
        { type: "ContentItem", id: item.id },
      );
    }
    if (chain) {
      // Check this round's drafts, then write the next batch while briefs are waiting (see CHAIN_ROUNDS).
      const start = (agentKey: string, next: number) =>
        startAgentRun({ workspaceId: brand.workspaceId, brandId: brand.brandId, agentKey, trigger: "event", input: agentKey === "quality" ? { round: next } : { chain: true, round: next } }).catch(() => null);
      if (drafted) await start("quality", round);
      const waiting = await prisma.contentItem.count({ where: { brandId: brand.brandId, status: "BRIEF_READY", studio: false } });
      if (waiting > 0 && round + 1 < CHAIN_ROUNDS && (await postAiAllowed(brand.workspaceId))) await start("creator", round + 1);
    }
    return { drafted };
  },
};
