import { z } from "zod";
import { CONTENT_PROMPT_VERSION, STORY_SYSTEM } from "@/server/agents/prompts/content";
import type { AgentContext } from "@/server/agents/types";
import { answeredBy } from "@/server/ai/provider";
import { linkedProducts } from "@/server/catalog/linked";
import type { CheckResult } from "@/server/content/rules";
import { prisma } from "@/server/db/prisma";
import { refundCharge } from "@/server/services/credits";
import { PublishingError } from "@/server/services/publishing";
import { type SourceRef, STORY_LIMITS, type StoryBody, type StoryFrameInput, type StoryInput } from "@/server/stories/body";
import { STORY_MEDIA_CHECKS } from "@/server/stories/checks";
import { textFits } from "@/server/stories/render";
import { listStorySources } from "@/server/stories/sources";

/**
 * The Creator's story writer. A first write picks each frame's photo from the product's catalogue photo and the brand
 * library (photos only, so the version renders in the request); a rewrite keeps every frame's picture, crop and clip
 * and writes new text for the same number of frames. Either way the version goes through the one render step
 * (saveStoryVersion). The link is never the model's: the linked product's page, else the previous link or the website.
 */
const FrameText = { label: z.string(), headline: z.string(), body: z.string(), composition: z.string() };
const FirstDraft = z.object({ frames: z.array(z.object({ sourceId: z.string(), ...FrameText })), cta: z.string() });
const Rewrite = z.object({ frames: z.array(z.object(FrameText)), cta: z.string() });
type Draft = { frames: (Record<keyof typeof FrameText, string> & { sourceId?: string })[]; cta: string };

/** ponytail: the first 20 photos (product photo first); a big library isn't all offered. */
const MAX_SOURCES = 20;

type StoryShared = {
  knowledge: string;
  productsLine: string;
  campaignLine: string;
  last?: StoryBody;
  reviewer?: string;
  report?: CheckResult[];
  chargeId?: string;
};
type StoryItem = { id: string; title: string; brief: unknown; productIds: string[]; versions: { version: number }[] };

/** Whether a check's blockers are all about the frames' media (no photo, wrong file, rights): rewriting text can't fix them. */
export function onlyMediaBlockers(results: { check: string; status: string }[]): boolean {
  const blockers = results.filter((r) => r.status === "blocker");
  return blockers.length > 0 && blockers.every((r) => (STORY_MEDIA_CHECKS as readonly string[]).includes(r.check));
}

/** Our own hard rules for a written story; null when it passes. `sources`: the offered ids (first write only). */
function storyDraftProblems(d: Draft, opts: { count: [number, number]; sources?: Set<string> }): string | null {
  const out: string[] = [];
  const [min, max] = opts.count;
  if (d.frames.length < min || d.frames.length > max) out.push(min === max ? `Write exactly ${min} frames.` : `Write ${min} to ${max} frames.`);
  if (d.cta.length > STORY_LIMITS.cta) out.push(`cta: at most ${STORY_LIMITS.cta} characters.`);
  const used = new Set<string>();
  d.frames.forEach((f, i) => {
    const n = `Frame ${i + 1}`;
    for (const k of ["label", "headline", "body", "composition"] as const) {
      if (f[k].length > STORY_LIMITS[k]) out.push(`${n}: ${k} at most ${STORY_LIMITS[k]} characters.`);
    }
    const fit = textFits(f, i === d.frames.length - 1, d.cta);
    if (!fit.fits) out.push(`${n}: the ${fit.field} doesn't fit on the frame; shorten it.`);
    if (opts.sources && f.sourceId) {
      if (!opts.sources.has(f.sourceId)) out.push(`${n}: use only the listed photo ids, or "".`);
      else if (used.has(f.sourceId)) out.push(`${n}: ${f.sourceId} is already used; never use a photo twice.`);
      used.add(f.sourceId);
    }
  });
  return out.length ? out.join(" ") : null;
}

const https = (url: string | null | undefined) => {
  if (!url) return null;
  try {
    return new URL(url).protocol === "https:" && url.length <= STORY_LIMITS.link ? url : null;
  } catch {
    return null;
  }
};

/** The linked product's page (its live row, as linkedProducts resolves it), else the previous link, else the website. */
async function storyLink(scope: { workspaceId: string; brandId: string }, productIds: string[], last: StoryBody | undefined, website: string | null) {
  const [first] = productIds.length ? await linkedProducts(prisma, scope, productIds.slice(0, 1)) : [];
  return https(first?.row?.url) ?? https(last?.link) ?? https(website) ?? "";
}

/**
 * Writes the story and saves it. Returns the save's outcome, or null when the save was refused (someone edited or
 * approved it meanwhile, a photo went away, the brand's render cap): logged, and a prepaid charge refunded, since the
 * person got nothing. An AI failure throws: the run is retried, and the engine refunds a prepaid run that finally fails.
 */
export async function writeStory(ctx: AgentContext, item: StoryItem, shared: StoryShared) {
  const { brand } = ctx;
  const scope = { workspaceId: brand.workspaceId, brandId: brand.brandId, userId: "agent" };
  const { last } = shared;
  const productIds = last ? last.productIds : item.productIds;
  const offered = last
    ? []
    : (await listStorySources(scope, { productIds, photosOnly: true }))
        .flatMap((t) => t.items)
        .filter((s) => s.kind === "photo")
        .slice(0, MAX_SOURCES)
        .map((s, i) => ({ id: `s${i + 1}`, ref: s.ref, title: s.title }));
  const refOf = new Map(offered.map((s) => [s.id, s.ref]));
  const link = await storyLink(scope, productIds, last, brand.websiteUrl);

  const task = last
    ? `\nCurrent frames (keep their pictures; write new text for exactly ${last.frames.length} frames, in order):\n${JSON.stringify(
        last.frames.map((f) => ({ label: f.label, headline: f.headline, body: f.body, composition: f.composition ?? "", picture: f.mediaKind ?? "none" })),
      )}\nCurrent CTA: ${JSON.stringify(last.cta)}\n`
    : `\nPhotos you can use (id | what it shows):\n${offered.map((s) => `- ${s.id} | ${s.title.replace(/\s+/g, " ")}`).join("\n") || "(none yet: sourceId \"\" for every frame)"}\n`;
  const prompt = `Brand: ${brand.displayName}\n\nBrand knowledge:\n${shared.knowledge}\n\n---\nThe story to write\nChannel: INSTAGRAM_STORY\nStory: ${item.title.replace(/\s+/g, " ")}\nBrief: ${JSON.stringify(item.brief)}\n${task}${
    shared.reviewer ? `\nThe approver asked for these changes (do exactly this):\n${shared.reviewer}\n` : ""
  }${shared.report?.length ? `\nQuality report to fix:\n${shared.report.map((r) => `- [${r.status}] ${r.check}: ${r.note}`).join("\n")}\n` : ""}${shared.productsLine}${shared.campaignLine}`;

  const sample = ["Nouvelle table Milo", "Chêne massif huilé", "Huit couverts", "Livrée montée", "Voir la table"];
  const draft: Draft = last
    ? await ctx.ai.generateObject({
        workflowId: "creator.revise",
        promptVersion: CONTENT_PROMPT_VERSION,
        schema: Rewrite,
        schemaName: "story_rewrite",
        system: STORY_SYSTEM,
        prompt,
        validate: (d) => storyDraftProblems(d, { count: [last.frames.length, last.frames.length] }),
        mock: { frames: last.frames.map((f) => ({ label: f.label, headline: f.headline, body: f.body, composition: f.composition ?? "" })), cta: last.cta },
      })
    : await ctx.ai.generateObject({
        workflowId: "creator.draft",
        promptVersion: CONTENT_PROMPT_VERSION,
        schema: FirstDraft,
        schemaName: "story_draft",
        system: STORY_SYSTEM,
        prompt,
        validate: (d) => storyDraftProblems(d, { count: [...STORY_LIMITS.frames], sources: new Set(refOf.keys()) }),
        mock: {
          frames: [0, 1, 2].map((i) => ({ sourceId: offered[i]?.id ?? "", label: i ? "" : "Nouveau", headline: sample[i], body: "", composition: "Le produit en lumière naturelle" })),
          cta: sample[4],
        },
      });

  const frames: StoryFrameInput[] = draft.frames.map((d, i) => {
    const kept = last?.frames[i];
    const source: SourceRef | undefined = kept ? kept.source : d.sourceId ? refOf.get(d.sourceId) : undefined;
    return {
      ...(source ? { source: { kind: source.kind, id: source.id } } : {}),
      label: d.label, headline: d.headline, body: d.body, composition: d.composition,
      ...(kept?.crop ? { crop: kept.crop } : {}),
      ...(kept?.clip ? { clip: kept.clip } : {}),
    };
  });
  const input: StoryInput = { frames, cta: draft.cta, link, brandMark: last ? last.brandMark : true };
  // A kept clip can't render in the request: that save goes to the job queue (which also refunds a failed paid render).
  const photosOnly = !last?.frames.some((f) => f.mediaKind === "video");
  const actor = { kind: "agent" as const, runId: ctx.runId, model: answeredBy(draft)?.model, ...(shared.chargeId ? { chargeId: shared.chargeId } : {}) };
  const entity = { type: "ContentItem", id: item.id };
  try {
    // Loaded here: service.ts imports the agent engine, whose registry imports the Creator and so this file.
    const { saveStoryVersion } = await import("@/server/stories/service");
    const saved = await saveStoryVersion(scope, item.id, item.versions[0]?.version ?? 0, input, actor, { photosOnly, keepEmpty: true });
    await ctx.log("SUCCESS", saved.status === "saved" ? `${last ? "Revised" : "Wrote"} story v${saved.version}: ${item.title}` : `${last ? "Revised" : "Wrote"} story, preparing its clips: ${item.title}`, entity);
    return saved;
  } catch (e) {
    if (!(e instanceof PublishingError)) throw e;
    if (shared.chargeId) await refundCharge(brand.workspaceId, shared.chargeId);
    await ctx.log("WARN", `Story not saved (${e.message}): ${item.title}`, entity);
    return null;
  }
}
