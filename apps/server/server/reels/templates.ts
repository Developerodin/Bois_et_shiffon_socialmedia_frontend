import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ReelAsset } from "@prisma/client";
import { productPhotos } from "@/server/content/knowledge";
import { prisma } from "@/server/db/prisma";
import { frame } from "@/server/photoshoot/shoot";
import { CREDIT_USD, MARGIN_FLOOR } from "@/server/photoshoot/tiers";
import { assetsOf, createAsset, registerAssetKind } from "@/server/reels/assets";
import { fetchResult, higgsfield } from "@/server/reels/higgsfield";
import { frameOf } from "@/server/reels/join";
import { ownMediaKey, PublishingError } from "@/server/services/publishing";
import { mediaKey, mediaKnown, putMedia, signedMediaUrl } from "@/server/storage/media";

/**
 * Reel templates (mobile R12): a shape the scriptwriter follows. Titles and subtitles are phone strings
 * (templates.item.<id>); `title` here is only the chat turn when the phone sends none. `motion` is the 5 s preview
 * clip's prompt. Bump `version` when `motion` changes, so previews are made again.
 */
export const REEL_TEMPLATES = [
  {
    id: "spotlight",
    version: 1,
    seconds: 20,
    title: "Product spotlight",
    ask: "Use the product spotlight format: a hook, then three close views of one product (shape, material, a detail), then the call to action. About 20 seconds.",
    motion: "Slow push-in on the product, soft daylight, gentle parallax. Keep the product's shape, material and colour exactly as in the image.",
  },
  {
    id: "collection",
    version: 1,
    seconds: 15,
    title: "Collection reveal",
    ask: "Use the collection reveal format: several products from one collection or one room, one quick scene each, ending on the call to action. About 15 seconds.",
    motion: "Smooth lateral camera slide across the scene, steady pace, natural light. Keep every product exactly as in the image.",
  },
  {
    id: "material",
    version: 1,
    seconds: 10,
    title: "Material detail",
    ask: "Use the material detail format: macro close-ups of the material and the craft (grain, texture, joins), then one wide view and the call to action. About 10 seconds.",
    motion: "Macro close-up drifting slowly across the surface, raking light revealing texture. Keep the material and colour exactly as in the image.",
  },
  {
    id: "arrival",
    version: 1,
    seconds: 15,
    title: "New arrival",
    ask: "Use the new arrival format: open by announcing something new, show the product in its setting, end with where to see or buy it. About 15 seconds.",
    motion: "Slow reveal as the camera rises and pulls back from the product, warm light. Keep the product exactly as in the image.",
  },
  {
    id: "three-uses",
    version: 1,
    seconds: 15,
    title: "Three ways to use it",
    ask: "Use the three-ways format: a hook, then three scenes showing three different uses or settings for the same product, then the call to action. About 15 seconds.",
    motion: "Gentle orbit around the product, calm daylight, unhurried movement. Keep the product exactly as in the image.",
  },
  {
    id: "detail-to-room",
    version: 1,
    seconds: 15,
    title: "From detail to room",
    ask: "Use the detail-to-room format: start on a close detail of the product and widen scene by scene until the whole room shows, then the call to action. About 15 seconds.",
    motion: "Starts on a close detail and pulls back slowly to show the product in its room, soft light. Keep the product exactly as in the image.",
  },
] as const;
export type ReelTemplate = (typeof REEL_TEMPLATES)[number];
export const templateById = (id: string) => REEL_TEMPLATES.find((t) => t.id === id);

/** "Preview with my photos": one 5 s Kling clip. */
export const PREVIEW_CREDITS = 10;
const PREVIEW_SECONDS = 5;
/**
 * ponytail: an estimate (Kling 3.0 std, ~$0.08/s on Higgsfield, 2026-11); check against the invoice. Headroom is
 * thin (72 % vs the 70 % floor): a real cost over $0.43 stops the server at start, so raise PREVIEW_CREDITS then.
 */
const PREVIEW_COST_USD = 0.4;
if (1 - PREVIEW_COST_USD / (PREVIEW_CREDITS * CREDIT_USD) < MARGIN_FLOOR) throw new Error(`Template previews are under the ${MARGIN_FLOOR * 100}% margin floor`);

/** Generic previews everyone sees until their brand pays for its own (scripts/render-template-previews.ts). */
export const genericPreviewKey = (t: ReelTemplate) => `system/templates/${t.id}-v${t.version}.mp4`;
export const posterKey = (videoKey: string) => videoKey.replace(/\.mp4$/, ".jpg");

/** Submits one preview clip of a 9:16 photo. The same idempotency key and body never charge twice. */
export const submitPreview = (prompt: string, photoUrl: string, idempotencyKey: string) =>
  higgsfield.animate({ model: "kling-3-std", photoUrl, prompt, seconds: PREVIEW_SECONDS, idempotencyKey });

/** Downloads a finished clip and stores it with its first frame as the poster. */
export async function storePreview(url: string, videoKey: string) {
  const dir = await mkdtemp(path.join(tmpdir(), "preview-"));
  try {
    const video = path.join(dir, "clip.mp4");
    const poster = path.join(dir, "poster.jpg");
    await writeFile(video, await fetchResult(url));
    await frameOf(video, "first", poster);
    await putMedia(videoKey, await readFile(video), "video/mp4");
    await putMedia(posterKey(videoKey), await readFile(poster), "image/jpeg");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ── paid per-brand previews: ReelAsset rows of kind "template-preview" (assets.ts runs them) ──────────────────────

type Scope = { workspaceId: string; brandId: string };
type PreviewInput = { templateId: string; photoKey: string; prompt: string; imageKey?: string; imageUrl?: string };

/**
 * The photo a brand's previews start from: the one its latest finished preview used, while the brand still has it,
 * so every card shows the same product; else its first library photo. null = no photos.
 */
export async function previewPhoto(scope: Scope, assets: ReelAsset[]) {
  const photos = await productPhotos(scope.workspaceId, scope.brandId);
  const last = assets.find((a) => a.status === "DONE")?.input as PreviewInput | undefined;
  return photos.find((p) => p.key === last?.photoKey)?.key ?? photos[0]?.key ?? null;
}

/** "Preview with my photos": charges and queues one preview of one template. */
export async function createTemplatePreview(scope: Scope & { userId: string }, templateId: string) {
  const template = templateById(templateId);
  if (!template) throw new PublishingError("Unknown template", 400);
  const photoKey = await previewPhoto(scope, await assetsOf(scope, "template-preview"));
  if (!photoKey) throw new PublishingError("Add product photos first, then preview a template with them.", 400);
  if (!ownMediaKey(scope, photoKey)) throw new PublishingError("Unknown image", 400); // a bad stored key is never signed
  // The prompt is kept on the row: a resend after a deploy must send what was first sent (same Idempotency-Key).
  const input: PreviewInput = { templateId, photoKey, prompt: template.motion };
  return createAsset(scope, { kind: "template-preview", input, credits: PREVIEW_CREDITS, reason: "template-preview", busy: "This preview is already being made." });
}

registerAssetKind("template-preview", {
  async submit(asset) {
    const input = asset.input as PreviewInput;
    // The cropped photo and its link are made once and kept on the row: a resend after a crash must send the
    // identical body under the same Idempotency-Key, or Higgsfield may treat it as a new (charged) job.
    let { imageUrl } = input;
    if (!imageUrl) {
      const imageKey = mediaKey(asset, `preview-${asset.id}-source.jpg`);
      const source = await fetch(await signedMediaUrl(input.photoKey), { signal: AbortSignal.timeout(30_000) });
      if (!source.ok) throw new Error(`Couldn't read the photo (${source.status})`);
      await putMedia(imageKey, await frame(new Uint8Array(await source.arrayBuffer()), "9:16"), "image/jpeg");
      imageUrl = await signedMediaUrl(imageKey, 24 * 3600);
      await prisma.reelAsset.update({ where: { id: asset.id }, data: { input: { ...input, imageKey, imageUrl } } });
    }
    return submitPreview(input.prompt, imageUrl, `asset:${asset.id}`);
  },
  async store(asset, url) {
    const videoKey = mediaKey(asset, `preview-${asset.id}.mp4`);
    await storePreview(url, videoKey);
    return videoKey;
  },
});

// ── what the phone shows (GET …/reels/options) ────────────────────────────────────────────────────────────────

const genericPreview = async (t: ReelTemplate) => ((await mediaKnown(genericPreviewKey(t))) ? genericPreviewKey(t) : null);

const media = async (videoKey: string) => ({ videoKey, videoUrl: await signedMediaUrl(videoKey), posterKey: posterKey(videoKey), posterUrl: await signedMediaUrl(posterKey(videoKey)) });

/**
 * R12's cards: each template with its preview (the brand's own when it has one, else the generic one, else none:
 * the phone shows its cover photo) and whether a brand preview is being made or failed last.
 * Keys go with the links so the phone caches by key (links change on every sign).
 */
export async function templateOptions(scope: Scope) {
  const assets = await assetsOf(scope, "template-preview");
  const photo = await previewPhoto(scope, assets);
  const templates = await Promise.all(
    REEL_TEMPLATES.map(async (t) => {
      const mine = assets.filter((a) => (a.input as PreviewInput).templateId === t.id);
      const done = mine.find((a) => a.status === "DONE" && a.outputKey);
      const key = done?.outputKey ?? (await genericPreview(t));
      return { id: t.id, seconds: t.seconds, preview: key ? await media(key) : null, own: !!done, making: mine.some((a) => a.status === "RUNNING"), failed: mine[0]?.status === "FAILED" };
    }),
  );
  return { templates, previewCredits: PREVIEW_CREDITS, canPreview: !!photo };
}
