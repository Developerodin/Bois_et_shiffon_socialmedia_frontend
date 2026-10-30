import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Prisma, ReelRender } from "@prisma/client";
import sharp from "sharp";
import { startAgentRun } from "@/server/agents/engine";
import { prisma } from "@/server/db/prisma";
import { enqueueJob } from "@/server/jobs/queue";
import { fetchResult, type HfStatus, higgsfield } from "@/server/reels/higgsfield";
import { joinReel } from "@/server/reels/join";
import { clipSeconds, planProblems, ReelPlan, reelPrice } from "@/server/reels/plan";
import { promptProblems } from "@/server/reels/prompt-check";
import { BACKUP_MODEL, type ModelId, modelSeconds, needsReencode, routeScene, VIDEO_MODELS } from "@/server/reels/router";
import { speak } from "@/server/reels/voice";
import { padAndJoinWav, wavSeconds } from "@/server/reels/wav";
import { refundCharge, spendCredits } from "@/server/services/credits";
import { lock, PublishingError, TX } from "@/server/services/publishing";
import { mediaKey, putMedia, signedMediaUrl } from "@/server/storage/media";

/**
 * Turns a studio reel's plan version into a video, one step per job:
 * VOICE (OpenAI voice per scene, photos cropped to 9:16) → CLIPS (one Higgsfield clip per scene, on its routed
 * model; polled) → JOIN (ffmpeg, into our storage) → DONE. Paid once per attempt; a failure refunds.
 * Double-submit safety: a claim (compare-and-set on claimedAt) plus a per-scene Idempotency-Key, so even a lost
 * claim or a crash between submitting and saving ids resends the same job, which Higgsfield doesn't charge twice.
 */
export const REEL_RENDER_JOB = "reel.render";
const POLL_MS = 20_000;
const CLAIM_STALE_MS = 2 * 60_000;
const GIVE_UP_MS = 24 * 3600_000;

type Requests = { CLIPS?: string[] };
type Outputs = {
  voiceKeys: string[];
  voiceSeconds: number[];
  photoKeys: string[];
  models: ModelId[];
  clipSeconds: number[]; // what each model was asked for
  backups: number[]; // scenes already retried on the backup model
  clipUrls?: string[];
};

export type Next =
  | { action: "voice" }
  | { action: "submit" }
  | { action: "wait" }
  | { action: "backup"; scenes: number[] }
  | { action: "join"; urls: string[] }
  | { action: "fail"; error: string }
  | { action: "done" };

type RenderState = Pick<ReelRender, "step" | "claimedAt" | "requests" | "outputs" | "createdAt">;

export function nextStep(r: RenderState, statuses: HfStatus[], now = Date.now()): Next {
  if (r.step === "DONE" || r.step === "FAILED") return { action: "done" };
  if (r.step === "VOICE") return { action: "voice" };
  const out = r.outputs as Outputs;
  if (r.step === "JOIN") return { action: "join", urls: out.clipUrls ?? [] };
  if (now - r.createdAt.getTime() > GIVE_UP_MS) return { action: "fail", error: "The video service took more than a day. Credits refunded; try again." };
  const ids = (r.requests as Requests).CLIPS;
  if (!ids?.length) return r.claimedAt && now - r.claimedAt.getTime() < CLAIM_STALE_MS ? { action: "wait" } : { action: "submit" };
  const failed = statuses.flatMap((s, i) => (s.state === "failed" ? [i] : []));
  const final = failed.find((i) => out.backups.includes(i));
  if (final !== undefined) return { action: "fail", error: `Scene ${final + 1}: ${statuses[final].error ?? "the clip failed"}` };
  if (failed.length) return { action: "backup", scenes: failed };
  if (statuses.every((s) => s.state === "completed")) return { action: "join", urls: statuses.map((s) => s.url!) };
  return { action: "wait" };
}

/** One poll job per render per 20-second slot: webhooks, app polling and the job's own follow-up collapse into it. */
export async function enqueueTick(r: Pick<ReelRender, "id" | "workspaceId" | "brandId">, delayMs = 0) {
  const runAt = new Date(Math.ceil((Date.now() + delayMs) / POLL_MS) * POLL_MS);
  await enqueueJob({ type: REEL_RENDER_JOB, workspaceId: r.workspaceId, brandId: r.brandId, payload: { renderId: r.id }, runAt, idempotencyKey: `reel:${r.id}:at:${runAt.getTime() / POLL_MS}` });
}

const ACTIVE = ["VOICE", "CLIPS", "JOIN"] as const;

/** "Make video" / "Try again": validates the latest plan version, charges once per attempt, queues the render. */
export async function startRender(input: { workspaceId: string; brandId: string; userId: string; itemId: string; version: number }) {
  const scope = { workspaceId: input.workspaceId, brandId: input.brandId };
  const loaded = await prisma.$transaction(async (tx) => {
    await lock(tx, input.itemId);
    const item = await tx.contentItem.findFirst({ where: { id: input.itemId, ...scope, studio: true }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    const latest = item?.versions[0];
    if (!item || !latest) throw new PublishingError("Reel not found", 404);
    const running = await tx.reelRender.findFirst({ where: { contentItemId: item.id, step: { in: [...ACTIVE] } } });
    if (running) return { running };
    if (latest.version !== input.version) throw new PublishingError("A newer plan exists. Review it, then make the video.");
    const parsed = ReelPlan.safeParse(latest.body);
    if (!parsed.success) throw new PublishingError("This plan isn't complete yet", 400);
    const problems = [...planProblems(parsed.data, scope), ...parsed.data.scenes.flatMap((s, i) => promptProblems(s.prompt ?? s.direction).map((p) => `Scene ${i + 1}: ${p}`))];
    if (problems.length) throw new PublishingError(problems.join(" "), 400);
    const { _max } = await tx.reelRender.aggregate({ where: { contentVersionId: latest.id }, _max: { attempt: true } });
    return { versionId: latest.id, plan: parsed.data, attempt: (_max.attempt ?? 0) + 1 };
  }, TX);
  if ("running" in loaded) return loaded.running!; // a second tap while it renders

  const refId = `${loaded.versionId}:${loaded.attempt}`;
  const chargeId = await spendCredits({ ...scope, amount: reelPrice(loaded.plan), reason: "reel-render", refId, userId: input.userId });
  const render = await prisma.$transaction(async (tx) => {
    await lock(tx, input.itemId);
    const running = await tx.reelRender.findFirst({ where: { contentItemId: input.itemId, step: { in: [...ACTIVE] } } });
    if (running) return running;
    return tx.reelRender.create({
      data: { ...scope, contentItemId: input.itemId, contentVersionId: loaded.versionId, attempt: loaded.attempt, chargeId, webhookSecret: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "") },
    });
  }, TX).catch(async (e: unknown) => {
    if ((e as { code?: string }).code === "P2002") return prisma.reelRender.findUniqueOrThrow({ where: { contentVersionId_attempt: { contentVersionId: loaded.versionId, attempt: loaded.attempt } } });
    throw e;
  });
  if (render.chargeId !== chargeId) await refundCharge(input.workspaceId, chargeId); // lost the race to another start
  await enqueueTick(render);
  return render;
}

/** Job handler: does whatever the render needs next, then schedules the next look. */
export async function advanceRender(payload: unknown) {
  const { renderId } = payload as { renderId: string };
  const r = await prisma.reelRender.findUnique({ where: { id: renderId } });
  if (!r) return;
  const ids = (r.requests as Requests).CLIPS ?? [];
  const statuses = r.step === "CLIPS" && ids.length ? await Promise.all(ids.map((id) => higgsfield.status(id))) : [];
  const next = nextStep(r, statuses);
  // A throw here is retried by the queue with backoff; failRender runs once its attempts are exhausted.
  switch (next.action) {
    case "done":
      return;
    case "voice":
      await prepareVoice(r);
      return enqueueTick(r);
    case "submit":
      await submitClips(r);
      return enqueueTick(r, POLL_MS);
    case "backup":
      await retryOnBackup(r, next.scenes);
      return enqueueTick(r, POLL_MS);
    case "wait":
      return enqueueTick(r, POLL_MS);
    case "join":
      return join(r, next.urls);
    case "fail":
      return failRender({ renderId }, new Error(next.error), true);
  }
}

async function planOf(r: ReelRender) {
  const v = await prisma.contentVersion.findUnique({ where: { id: r.contentVersionId } });
  return ReelPlan.parse(v?.body);
}

const webhookFor = (r: ReelRender) => {
  const base = process.env.AUTH_URL;
  return base?.startsWith("https://") ? `${base.replace(/\/$/, "")}/api/v1/webhooks/higgsfield/${r.id}?s=${r.webhookSecret}` : undefined;
};

async function prepareVoice(r: ReelRender) {
  const plan = await planOf(r);
  const scope = { workspaceId: r.workspaceId, brandId: r.brandId };
  const scenes = await Promise.all(plan.scenes.map(async (s) => {
    const wav = await speak({ text: s.voiceText, voice: plan.voice });
    const voiceKey = mediaKey(scope, `${randomUUID()}.wav`);
    await putMedia(voiceKey, wav, "audio/wav");
    // Kling and Seedance follow the photo's shape: crop to 9:16 first.
    const src = new Uint8Array(await (await fetch(await signedMediaUrl(s.photoKey))).arrayBuffer());
    const photoKey = mediaKey(scope, `${randomUUID()}.jpg`);
    await putMedia(photoKey, await sharp(src).resize(1080, 1920, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer(), "image/jpeg");
    const seconds = wavSeconds(wav);
    let model: ModelId = s.model ?? routeScene(s.kind ?? "detail");
    if (Math.ceil(seconds) > VIDEO_MODELS[model].maxSeconds) model = BACKUP_MODEL; // e.g. Hailuo stops at 10 s
    return { voiceKey, photoKey, seconds, model };
  }));
  const outputs: Outputs = {
    voiceKeys: scenes.map((s) => s.voiceKey),
    voiceSeconds: scenes.map((s) => s.seconds),
    photoKeys: scenes.map((s) => s.photoKey),
    models: scenes.map((s) => s.model),
    clipSeconds: scenes.map((s) => modelSeconds(s.model, s.seconds)),
    backups: [],
  };
  // ponytail: a duplicate tick that lost this race wasted one set of voice calls (cents); not worth a claim.
  await prisma.reelRender.updateMany({ where: { id: r.id, step: "VOICE" }, data: { step: "CLIPS", outputs: outputs as Prisma.InputJsonValue } });
}

async function submitClips(r: ReelRender) {
  const claim = await prisma.reelRender.updateMany({ where: { id: r.id, step: "CLIPS", claimedAt: r.claimedAt }, data: { claimedAt: new Date() } });
  if (claim.count !== 1) return;
  const plan = await planOf(r);
  const out = r.outputs as Outputs;
  const ids = await Promise.all(plan.scenes.map(async (s, i) =>
    higgsfield.animate({ model: out.models[i], photoUrl: await signedMediaUrl(out.photoKeys[i], 6 * 3600), prompt: s.prompt ?? s.direction, seconds: out.clipSeconds[i], webhook: webhookFor(r), idempotencyKey: `${r.id}:clip:${i}` }),
  ));
  await prisma.reelRender.update({ where: { id: r.id }, data: { requests: { CLIPS: ids }, claimedAt: null } });
}

async function retryOnBackup(r: ReelRender, scenes: number[]) {
  const plan = await planOf(r);
  const out = r.outputs as Outputs;
  const ids = [...((r.requests as Requests).CLIPS ?? [])];
  for (const i of scenes) {
    const seconds = modelSeconds(BACKUP_MODEL, out.voiceSeconds[i]);
    ids[i] = await higgsfield.animate({ model: BACKUP_MODEL, photoUrl: await signedMediaUrl(out.photoKeys[i], 6 * 3600), prompt: plan.scenes[i].prompt ?? plan.scenes[i].direction, seconds, webhook: webhookFor(r), idempotencyKey: `${r.id}:clip:${i}:backup` });
    out.models[i] = BACKUP_MODEL;
    out.clipSeconds[i] = seconds;
    out.backups.push(i);
  }
  await prisma.reelRender.update({ where: { id: r.id }, data: { requests: { CLIPS: ids }, outputs: out as Prisma.InputJsonValue } });
}

async function join(r: ReelRender, urls: string[]) {
  const out = { ...(r.outputs as Outputs), clipUrls: urls };
  if (r.step === "CLIPS") {
    const moved = await prisma.reelRender.updateMany({ where: { id: r.id, step: "CLIPS" }, data: { step: "JOIN", outputs: out as Prisma.InputJsonValue } });
    if (moved.count !== 1) return;
  }
  const scope = { workspaceId: r.workspaceId, brandId: r.brandId };
  const dir = await mkdtemp(path.join(tmpdir(), "reel-"));
  try {
    // Each scene lasts as long as its voice (rounded up); longer clips are trimmed to it.
    const sceneSeconds = out.voiceSeconds.map(clipSeconds);
    const clips = await Promise.all(urls.map(async (u, i) => {
      const file = path.join(dir, `clip${i}.mp4`);
      await writeFile(file, await fetchResult(u));
      return { file, seconds: Math.min(sceneSeconds[i], out.clipSeconds[i]) };
    }));
    const voices = await Promise.all(out.voiceKeys.map(async (k) => new Uint8Array(await (await fetch(await signedMediaUrl(k))).arrayBuffer())));
    const wav = path.join(dir, "voice.wav");
    await writeFile(wav, padAndJoinWav(voices, clips.map((c) => c.seconds)));
    const mp4 = path.join(dir, "reel.mp4");
    const reencode = needsReencode(clips.map((c, i) => ({ model: out.models[i], clip: out.clipSeconds[i], scene: c.seconds })));
    await joinReel(clips, wav, mp4, { reencode });
    const videoKey = mediaKey(scope, `${randomUUID()}.mp4`);
    await putMedia(videoKey, await readFile(mp4), "video/mp4");

    await prisma.$transaction(async (tx) => {
      await lock(tx, r.contentItemId);
      const item = await tx.contentItem.findFirst({ where: { id: r.contentItemId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
      const latest = item?.versions[0];
      if (!item || !latest) throw new Error("The reel was deleted while rendering");
      await tx.contentVersion.create({ data: { contentItemId: item.id, version: latest.version + 1, body: { ...(latest.body as object), videoKey }, createdBy: "agent" } });
      await tx.contentItem.update({ where: { id: item.id }, data: { status: "DRAFT_REVIEW" } });
      await tx.reelRender.update({ where: { id: r.id }, data: { step: "DONE", videoKey, error: null } });
    }, TX);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  await startAgentRun({ ...scope, agentKey: "quality", trigger: "event", input: { itemId: r.contentItemId } }).catch(() => null); // the app's next poll shows "checking"; a missed run is retried from R07
}

/** Job onFailure, and the step machine's own give-up: mark failed once, refund once. */
export async function failRender(payload: unknown, error: unknown, exhausted: boolean) {
  if (!exhausted) return;
  const { renderId } = payload as { renderId: string };
  const message = error instanceof Error ? error.message : String(error);
  const moved = await prisma.reelRender.updateMany({ where: { id: renderId, step: { in: [...ACTIVE] } }, data: { step: "FAILED", error: message.slice(0, 500), claimedAt: null } });
  if (moved.count !== 1) return;
  const r = await prisma.reelRender.findUnique({ where: { id: renderId } });
  if (!r) return;
  await refundCharge(r.workspaceId, r.chargeId);
  await prisma.auditEvent.create({ data: { workspaceId: r.workspaceId, brandId: r.brandId, action: "reel.render.failed", entityType: "ReelRender", entityId: r.id, metadata: { error: message.slice(0, 500), attempt: r.attempt } } });
}

/** For the app: each version's latest render. */
export async function renderView(itemId: string) {
  const renders = await prisma.reelRender.findMany({ where: { contentItemId: itemId }, orderBy: { createdAt: "desc" }, take: 20 });
  return renders.map((r) => ({ id: r.id, versionId: r.contentVersionId, attempt: r.attempt, step: r.step, error: r.error, videoKey: r.videoKey, createdAt: r.createdAt }));
}
