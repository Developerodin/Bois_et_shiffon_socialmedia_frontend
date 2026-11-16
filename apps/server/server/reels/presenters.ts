import type { Prisma } from "@prisma/client";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { assetsOf, createAsset, registerAssetKind } from "@/server/reels/assets";
import { fetchResult, higgsfield } from "@/server/reels/higgsfield";
import { CREDIT_USD, MARGIN_FLOOR } from "@/server/photoshoot/tiers";
import { CREDIT_COSTS } from "@/server/services/credits";
import { PublishingError } from "@/server/services/publishing";
import { deleteMedia, mediaKey, putMedia, signedMediaUrl } from "@/server/storage/media";

/**
 * Brand presenters (mobile R10): a character sheet made by Higgsfield AI Influencer from a few traits, later shown
 * speaking in presenter scenes (render.ts). A presenter is a ReelAsset of kind "presenter"; removing it deletes the
 * row, and a reel planned with it is then refused at render.
 * The request body ({tier, selection, brief, medias}) is what Higgsfield's own prepare step returns (2026-11-12);
 * the field holding the sheet in the finished status is a guess (images[0].url) until the first live run.
 */
export const PRESENTER_CREDITS = 2;
/**
 * Presenter scenes are priced per second (plan.ts, CREDIT_COSTS.presenterPerSecond). ponytail: an estimate (Seedance
 * 2.5 reference-to-video, ~$0.15/s, 2026-11); check against the invoice. The sheet (1.125 Higgsfield credits quoted)
 * has no check until its real price is known.
 */
const PRESENTER_COST_USD_PER_SECOND = 0.15;
if (1 - PRESENTER_COST_USD_PER_SECOND / (CREDIT_COSTS.presenterPerSecond * CREDIT_USD) < MARGIN_FLOOR) throw new Error(`Presenter seconds are under the ${MARGIN_FLOOR * 100}% margin floor`);

/** The traits the app offers: AI Influencer's own option ids (tier "normal"). English labels; the app translates them. */
export const PRESENTER_TRAITS = [
  { id: "gender", options: { female: "Female", male: "Male", non_binary: "Non-binary" } },
  { id: "age", options: { adult: "Adult", mature: "Mature", senior: "Senior" } },
  { id: "ethnicity_origin_base", options: { african: "African", east_asian: "Asian", european: "European", indian: "Indian", middle_eastern: "Middle Eastern", latin_american: "Mixed" } },
  { id: "skin_tone", options: { st_porcelain: "Porcelain", st_fair: "Fair", st_light: "Light", st_olive: "Olive", st_tan: "Tan", st_brown: "Brown", st_deep: "Deep brown", st_ebony: "Ebony" } },
  { id: "hair", options: { hair_short: "Short hair", hair_long: "Long hair", hair_braids: "Braids", hair_afro: "Afro", hair_buzz: "Buzz cut", hair_bald: "Bald" } },
  { id: "hair_colour", options: { hc_black: "Jet black", hc_darkbrown: "Dark brown", hc_chestnut: "Chestnut", hc_ginger: "Ginger", hc_blonde: "Blonde", hc_grey: "Grey", hc_white: "White" } },
  { id: "aesthetic", options: { casual: "Casual", suits: "Suits", retro: "Retro", sporty: "Sporty", streetstyle: "Streetstyle" } },
] as const;

const traitIds = new Map<string, readonly string[]>(PRESENTER_TRAITS.map((g) => [g.id, Object.keys(g.options)]));
export const PresenterRequest = z.object({
  name: z.string().trim().min(1).max(40),
  traits: z.record(z.string(), z.string()).refine((t) => Object.entries(t).every(([g, o]) => traitIds.get(g)?.includes(o)), "Unknown trait"),
});
export type PresenterRequest = z.infer<typeof PresenterRequest>;
type PresenterInput = { name: string; body: { tier: "normal"; selection: Record<string, string[]>; brief: string; medias: [] } };

type Scope = { workspaceId: string; brandId: string };

/** R10 "Create presenter": charges and queues one character sheet. One being made per brand at a time. */
export async function createPresenter(scope: Scope & { userId: string }, req: PresenterRequest) {
  // The body is kept on the row: a resend must send what was first sent (same Idempotency-Key).
  const body = { tier: "normal" as const, selection: Object.fromEntries(Object.entries(req.traits).map(([g, o]) => [g, [o]])), brief: "A warm, natural presenter for a brand's product videos, speaking to camera.", medias: [] as [] };
  const input: PresenterInput = { name: req.name, body };
  return createAsset(scope, { kind: "presenter", input: input as unknown as Prisma.InputJsonObject, credits: PRESENTER_CREDITS, reason: "presenter", busy: "A presenter is already being made. Wait for it to finish." });
}

registerAssetKind("presenter", {
  submit: (asset) => higgsfield.image("/higgsfield/ai-influencer", (asset.input as PresenterInput).body, `asset:${asset.id}`),
  async store(asset, url) {
    const key = mediaKey(asset, `presenter-${asset.id}.jpg`);
    await putMedia(key, await sharp(await fetchResult(url, 25 * 1024 * 1024)).jpeg({ quality: 90 }).toBuffer(), "image/jpeg");
    return key;
  },
});

/** R10's list: every presenter of the brand, with its sheet (signed; the key goes along for the phone's cache). */
export async function listPresenters(scope: Scope) {
  const rows = await assetsOf(scope, "presenter");
  return Promise.all(
    rows.map(async (a) => ({
      id: a.id,
      name: (a.input as PresenterInput).name,
      status: a.status as "RUNNING" | "DONE" | "FAILED",
      sheet: a.outputKey ? { key: a.outputKey, url: await signedMediaUrl(a.outputKey) } : null,
    })),
  );
}

/** Removes a presenter (its sheet too). Reels planned with it are refused at render until another is picked. */
export async function removePresenter(scope: Scope, id: string) {
  const a = await prisma.reelAsset.findFirst({ where: { id, workspaceId: scope.workspaceId, brandId: scope.brandId, kind: "presenter" } });
  if (!a) throw new PublishingError("Presenter not found", 404);
  if (a.status === "RUNNING") throw new PublishingError("This presenter is still being made. Remove it once it's done.", 409);
  await prisma.reelAsset.delete({ where: { id: a.id } });
  if (a.outputKey) await deleteMedia(a.outputKey).catch(() => {}); // ponytail: an orphaned sheet costs storage only
}

/** The presenter a plan names, if it is a finished presenter of this brand. */
export const donePresenter = (scope: Scope, id: string, db: Pick<typeof prisma, "reelAsset"> = prisma) =>
  db.reelAsset.findFirst({ where: { id, workspaceId: scope.workspaceId, brandId: scope.brandId, kind: "presenter", status: "DONE" } });
