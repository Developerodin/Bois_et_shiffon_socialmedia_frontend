import { randomUUID } from "node:crypto";
import type { PhotoShoot } from "@prisma/client";
import sharp from "sharp";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { enqueueJob } from "@/server/jobs/queue";
import { SHOOT_TIERS, SHOTS, type ShootRatio, TIERS } from "@/server/photoshoot/tiers";
import { fetchResult, higgsfield } from "@/server/reels/higgsfield";
import { refundCharge, spendCredits } from "@/server/services/credits";
import { ownMediaKey, PublishingError } from "@/server/services/publishing";
import { requirePlan } from "@/server/services/subscriptions";
import { mediaKey, putMedia, signedMediaUrl } from "@/server/storage/media";

/**
 * A photoshoot: SHOTS images of one brand photo, staged (product) or worn by a model (fashion), on the tier the person
 * picked. Paid up front, refunded if it fails. OpenAI tiers answer in one call; Higgsfield tiers are submitted, then
 * polled every POLL_MS by the same job until every shot is back. Finished shots are JPGs in the brand's media, so
 * posts can use them like any other brand photo.
 */
export const PHOTOSHOOT_JOB = "photoshoot.run";
const POLL_MS = 15_000;
const GIVE_UP_MS = 60 * 60_000;

const sourceKey = z.string().min(1).max(300);
const tier = z.enum(SHOOT_TIERS);
export const ShootRequest = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("product"),
      tier,
      sourceKey,
      ratio: z.enum(["1:1", "4:5", "9:16"]),
      scene: z.enum(["studio", "interior", "custom"]),
      brief: z.string().trim().max(600).default(""),
    })
    .refine((b) => b.scene !== "custom" || b.brief, "Describe the scene you want"),
  z.object({
    kind: z.literal("fashion"),
    tier,
    sourceKey,
    ratio: z.enum(["4:5", "9:16"]),
    model: z.enum(["natural", "editorial", "casual"]).optional(),
    pose: z.enum(["fullBody", "threeQuarter", "closeUp"]),
    background: z.enum(["studioMinimal", "urbanStreet", "naturalInterior"]),
  }),
]);
export type ShootRequest = z.infer<typeof ShootRequest>;

const SCENE = {
  studio: "a clean seamless studio backdrop with soft, even daylight",
  interior: "a calm, styled home interior that suits the product, softly lit by daylight",
  custom: "as the art direction describes",
} as const;
const MODEL = { natural: "a woman with a natural, relaxed look", editorial: "a woman with a poised editorial look", casual: "a man with a casual, easy look" } as const;
const POSE = { fullBody: "Full-body shot, standing", threeQuarter: "Three-quarter shot from mid-thigh up", closeUp: "Close-up on the garment, face partly in frame" } as const;
const BACKGROUND = { studioMinimal: "a minimal studio", urbanStreet: "a quiet city street", naturalInterior: "a bright, natural interior" } as const;

export function shootPrompt(r: ShootRequest) {
  if (r.kind === "product")
    return [
      "Professional product photograph of the exact product in the reference photo.",
      "Keep the product identical: same shape, proportions, materials, colours, details and any visible text. Change only the setting and the light.",
      `Setting: ${SCENE[r.scene]}.`,
      r.brief ? `Art direction: ${r.brief}` : "",
      "Photorealistic, natural shadows, no added text or logos, no people.",
    ].filter(Boolean).join(" ");
  return [
    `Fashion photograph of ${r.model ? MODEL[r.model] : "a model who suits the garment"} wearing the exact garment in the reference photo.`,
    "Keep the garment identical: same cut, fit, colour, fabric, pattern and details.",
    `${POSE[r.pose]}. Background: ${BACKGROUND[r.background]}.`,
    "Editorial lighting, realistic skin and fabric, no added text or logos.",
  ].join(" ");
}

type Scope = { workspaceId: string; brandId: string };

/** F02/F03 "Generate": checks the photo is the brand's, charges the tier, queues the shoot. */
export async function createShoot(scope: Scope & { userId: string }, request: ShootRequest) {
  await requirePlan(scope.workspaceId); // photoshoots need a plan, like reels
  if (!ownMediaKey(scope, request.sourceKey)) throw new PublishingError("Unknown image", 400);
  const id = randomUUID();
  const credits = TIERS[request.tier].credits;
  const chargeId = await spendCredits({ workspaceId: scope.workspaceId, amount: credits, reason: "photoshoot", refId: id, userId: scope.userId });
  const shoot = await prisma.photoShoot
    .create({ data: { id, workspaceId: scope.workspaceId, brandId: scope.brandId, kind: request.kind, tier: request.tier, input: request, credits, chargeId } })
    .catch(async (e: unknown) => {
      await refundCharge(scope.workspaceId, chargeId);
      throw e;
    });
  // Due at once, so the POST's kickRunner picks it up. Nothing else would ever look at a shoot with no job.
  await enqueueJob({ type: PHOTOSHOOT_JOB, workspaceId: shoot.workspaceId, brandId: shoot.brandId, payload: { shootId: shoot.id }, maxAttempts: attemptsFor(shoot), idempotencyKey: `shoot:${shoot.id}:start` }).catch(async (e: unknown) => {
    await failShoot(shoot.id, e instanceof Error ? e.message : String(e));
    throw e;
  });
  return shoot;
}

/**
 * An OpenAI shoot gets one attempt: a retry would pay OpenAI again for the whole shoot (a failure refunds the person
 * instead). Higgsfield steps may retry: resubmits carry the same Idempotency-Key and body, so they aren't charged twice.
 */
const attemptsFor = (s: Pick<PhotoShoot, "kind" | "tier">) => (TIERS[s.tier as ShootRequest["tier"]][s.kind as ShootRequest["kind"]].provider === "openai" ? 1 : 3);

/** The next poll: one job per shoot per POLL_MS slot, so a retried step and its follow-up can't both run. */
async function enqueuePoll(s: Pick<PhotoShoot, "id" | "workspaceId" | "brandId">) {
  const runAt = new Date(Math.ceil((Date.now() + POLL_MS) / POLL_MS) * POLL_MS);
  await enqueueJob({ type: PHOTOSHOOT_JOB, workspaceId: s.workspaceId, brandId: s.brandId, payload: { shootId: s.id }, runAt, maxAttempts: 3, idempotencyKey: `shoot:${s.id}:at:${runAt.getTime() / POLL_MS}` });
}

/** Higgsfield refused the request itself (bad input, no balance): resending won't help (as render.ts). */
export const refused = (e: unknown) => e instanceof Error && /^Higgsfield 4\d\d\b/.test(e.message) && !/^Higgsfield 429\b/.test(e.message);

/** Job handler: makes the shots (OpenAI), or submits / polls them (Higgsfield). */
export async function runShoot(payload: unknown) {
  const { shootId } = payload as { shootId: string };
  const shoot = await prisma.photoShoot.findUnique({ where: { id: shootId } });
  if (!shoot || shoot.status !== "RUNNING") return;
  const request = ShootRequest.parse(shoot.input);
  const engine = TIERS[request.tier][request.kind];
  const prompt = shootPrompt(request);

  if (engine.provider === "openai") return finish(shoot, request.ratio, await openaiShots(request.sourceKey, prompt, request.ratio, engine.quality));

  if (!shoot.requests.length) {
    // The link is signed once and kept on the row: a resend after a crash must send the identical body under the
    // same Idempotency-Keys, or Higgsfield may treat it as a new (charged) job.
    const saved = (shoot.input as { imageUrl?: string }).imageUrl;
    const imageUrl = saved ?? (await signedMediaUrl(request.sourceKey, 24 * 3600));
    if (!saved) await prisma.photoShoot.update({ where: { id: shoot.id }, data: { input: { ...request, imageUrl } } });
    const body = engine.body({ prompt, imageUrl, ratio: request.ratio });
    try {
      const ids = await Promise.all(Array.from({ length: SHOTS }, (_, i) => higgsfield.image(engine.path, body, `shoot:${shoot.id}:${i}`)));
      await prisma.photoShoot.update({ where: { id: shoot.id }, data: { requests: ids } });
    } catch (e) {
      if (refused(e)) return failShoot(shoot.id, (e as Error).message);
      throw e;
    }
    return enqueuePoll(shoot);
  }
  // A status read that fails is a hiccup, not a failed shot: the shots may well be finishing (render.ts does the same).
  const statuses = await Promise.all(shoot.requests.map((r) => higgsfield.status(r).catch(() => null)));
  const failed = statuses.find((s) => s?.state === "failed");
  if (failed) return failShoot(shoot.id, failed.error ?? "A shot failed");
  if (statuses.every((s) => s?.state === "completed")) return finish(shoot, request.ratio, await Promise.all(statuses.map((s) => fetchResult(s!.url!, 25 * 1024 * 1024))));
  if (Date.now() - shoot.createdAt.getTime() > GIVE_UP_MS) return failShoot(shoot.id, "The photoshoot took more than an hour");
  return enqueuePoll(shoot);
}

/** The job gave up (every attempt failed): the shoot fails and its credits go back. */
export async function onShootFailure(payload: unknown, error: unknown, exhausted: boolean) {
  if (!exhausted) return;
  await failShoot((payload as { shootId: string }).shootId, error instanceof Error ? error.message : String(error));
}

/** One transaction: a shoot is never FAILED without its refund (a retry finds it failed and wouldn't refund). */
async function failShoot(id: string, error: string) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.photoShoot.updateMany({ where: { id, status: "RUNNING" }, data: { status: "FAILED", error: error.slice(0, 500) } });
    if (!count) return;
    const shoot = await tx.photoShoot.findUniqueOrThrow({ where: { id } });
    await refundCharge(shoot.workspaceId, shoot.chargeId, tx);
  });
}

async function finish(shoot: PhotoShoot, ratio: ShootRatio, images: Uint8Array[]) {
  const scope = { workspaceId: shoot.workspaceId, brandId: shoot.brandId };
  const keys = await Promise.all(
    images.map(async (bytes, i) => {
      const key = mediaKey(scope, `shoot-${shoot.id}-${i + 1}.jpg`);
      await putMedia(key, await frame(bytes, ratio), "image/jpeg");
      return key;
    }),
  );
  await prisma.photoShoot.updateMany({ where: { id: shoot.id, status: "RUNNING" }, data: { status: "DONE", outputKeys: keys } });
}

/** Crops to the exact ratio asked (models only offer a few) and saves as JPG, the format posts accept. */
export async function frame(bytes: Uint8Array, ratio: ShootRatio) {
  const [w, h] = ratio.split(":").map(Number);
  const img = sharp(bytes);
  const { width = 0, height = 0 } = await img.metadata();
  const scale = Math.min(width / w, height / h);
  return img.resize(Math.floor(w * scale), Math.floor(h * scale), { fit: "cover" }).jpeg({ quality: 90 }).toBuffer();
}

/** OpenAI image edit: SHOTS images from the source photo in one call. */
async function openaiShots(sourceKey: string, prompt: string, ratio: ShootRatio, quality: "low" | "medium" | "high") {
  if (!process.env.OPENAI_API_KEY) throw new Error("Photoshoots aren't set up on this server (OPENAI_API_KEY is missing).");
  const source = await fetch(await signedMediaUrl(sourceKey), { signal: AbortSignal.timeout(30_000) });
  if (!source.ok) throw new Error(`Couldn't read the source photo (${source.status})`);
  const form = new FormData();
  form.append("model", "gpt-image-2");
  form.append("prompt", prompt);
  form.append("n", String(SHOTS));
  form.append("quality", quality);
  form.append("size", ratio === "1:1" ? "1024x1024" : "1024x1536");
  form.append("image[]", new Blob([await source.arrayBuffer()], { type: sourceKey.endsWith(".png") ? "image/png" : "image/jpeg" }), sourceKey.endsWith(".png") ? "source.png" : "source.jpg");
  const res = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: form,
    // High quality, four images: up to a few minutes. ponytail: under the 300 s job cap with the fetch and uploads;
    // split into four n=1 calls saved one by one if Ultra ever runs into it.
    signal: AbortSignal.timeout(200_000),
  });
  const data = (await res.json().catch(() => ({}))) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  if (!res.ok) throw new Error(`Image generation failed (${res.status}): ${data.error?.message ?? ""}`.trim());
  const images = (data.data ?? []).flatMap((d) => (d.b64_json ? [new Uint8Array(Buffer.from(d.b64_json, "base64"))] : []));
  if (!images.length) throw new Error("Image generation returned no images");
  return images;
}

/** What the app shows: the request, the source and finished shots as signed links (1 h). */
export async function shootView(s: PhotoShoot) {
  const input = { ...(s.input as ShootRequest & { imageUrl?: string }) };
  delete input.imageUrl; // the signed link kept for Higgsfield resends
  return {
    id: s.id,
    kind: s.kind,
    tier: s.tier,
    status: s.status,
    input,
    credits: s.credits,
    // Provider errors ("Higgsfield 403: not_enough_credits") stay on the row; the app only says it didn't work.
    failed: s.status === "FAILED",
    createdAt: s.createdAt.toISOString(),
    sourceUrl: await signedMediaUrl(input.sourceKey),
    shots: await Promise.all(s.outputKeys.map(async (key) => ({ key, url: await signedMediaUrl(key) }))),
  };
}

export async function listShoots(scope: Scope) {
  // ponytail: the latest 50; page when a brand has more.
  const rows = await prisma.photoShoot.findMany({ where: { workspaceId: scope.workspaceId, brandId: scope.brandId }, orderBy: { createdAt: "desc" }, take: 50 });
  return Promise.all(rows.map(shootView));
}

export async function getShoot(scope: Scope, id: string) {
  const s = await prisma.photoShoot.findFirst({ where: { id, workspaceId: scope.workspaceId, brandId: scope.brandId } });
  if (!s) throw new PublishingError("Photoshoot not found", 404);
  return shootView(s);
}
