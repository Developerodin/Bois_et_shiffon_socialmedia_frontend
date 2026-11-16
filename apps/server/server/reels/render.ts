import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Prisma, ReelRender } from "@prisma/client";
import sharp from "sharp";
import { startAgentRun } from "@/server/agents/engine";
import { prisma } from "@/server/db/prisma";
import { enqueueJob } from "@/server/jobs/queue";
import { notifyReelFinished } from "@/server/notifications/push";
import { fetchResult, type HfStatus, higgsfield } from "@/server/reels/higgsfield";
import { checkSeam } from "@/server/reels/agents";
import { frameOf, joinReel } from "@/server/reels/join";
import { productPhotos } from "@/server/content/knowledge";
import { planOwnershipProblems } from "@/server/reels/ownership";
import { aiDisclosureLine, clipSeconds, needsAiDisclosure, planProblems, PRESENTER_MIN_SECONDS, ReelPlan, reelPrice, standInProblems } from "@/server/reels/plan";
import { donePresenter } from "@/server/reels/presenters";
import { recordingKeys, recordingProblems } from "@/server/reels/recordings";
import { promptProblems } from "@/server/reels/prompt-check";
import { BACKUP_MODEL, type ModelId, modelSeconds, needsReencode, PRESENTER_MODEL, routeScene, type Transition, VIDEO_MODELS } from "@/server/reels/router";
import { libraryUsable } from "@/server/reels/library";
import { isElevenVoice, speak, voiceRefused } from "@/server/reels/voice";
import { padAndJoinWav, wavSeconds } from "@/server/reels/wav";
import { refundCharge, spendCredits } from "@/server/services/credits";
import { lock, PublishingError, TX } from "@/server/services/publishing";
import { mediaKey, putMedia, signedMediaUrl } from "@/server/storage/media";
import { requirePlan } from "@/server/services/subscriptions";

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
// A join downloads every clip and runs ffmpeg (each capped at 120 s) inside one job (300 s cap): only a claim older
// than that is a crashed join. Shorter, and a second tick would join the same reel in parallel.
const JOIN_STALE_MS = 6 * 60_000;
const JOIN_TRIES = 3;
const GIVE_UP_MS = 24 * 3600_000;
const GIVE_UP_ERROR = "The video took more than a day. Credits refunded; try again.";

type Requests = { CLIPS?: string[] };
/** One join between scenes after the seam check: what the director planned, what was used, and why. */
export type Seam = { after: number; planned: Transition; used: Transition; fits: boolean | null; note?: string };

type Outputs = {
  joinErrors?: number;
  seams?: Seam[];
  voiceKeys: string[];
  voiceSeconds: number[];
  photoKeys: string[];
  photoUrls?: string[]; // signed once at VOICE (24 h): a resubmit must send the identical body
  models: ModelId[];
  clipSeconds: number[]; // what each model was asked for
  backups: number[]; // scenes already retried on the backup model
  clipUrls?: string[];
  // Presenter scenes: their references (sheet + product photo) and voice, signed once at VOICE (24 h) so a resubmit
  // sends the identical body; null for product scenes. presenterRetried: presenter scenes already retried once.
  refs?: ({ imageUrls: string[]; audioUrl: string } | null)[];
  prompts?: string[]; // each clip's prompt, fixed at VOICE for the same reason (presenter prompts read photo titles)
  presenterRetried?: number[];
};

export type Next =
  | { action: "voice" }
  | { action: "submit" }
  | { action: "wait" }
  | { action: "backup"; scenes: number[] }
  | { action: "retryPresenter"; scenes: number[] }
  | { action: "join"; urls: string[] }
  | { action: "fail"; error: string }
  | { action: "done" };

type RenderState = Pick<ReelRender, "step" | "claimedAt" | "requests" | "outputs" | "createdAt">;

export function nextStep(r: RenderState, statuses: HfStatus[], now = Date.now()): Next {
  if (r.step === "DONE" || r.step === "FAILED") return { action: "done" };
  if (r.step === "VOICE") return { action: "voice" };
  const out = r.outputs as Outputs;
  if (now - r.createdAt.getTime() > GIVE_UP_MS) return { action: "fail", error: GIVE_UP_ERROR };
  if (r.step === "JOIN") return r.claimedAt && now - r.claimedAt.getTime() < JOIN_STALE_MS ? { action: "wait" } : { action: "join", urls: out.clipUrls ?? [] };
  const ids = (r.requests as Requests).CLIPS;
  if (!ids?.length) return r.claimedAt && now - r.claimedAt.getTime() < CLAIM_STALE_MS ? { action: "wait" } : { action: "submit" };
  const failed = statuses.flatMap((s, i) => (s.state === "failed" ? [i] : []));
  // A presenter scene gets one retry on its own model (no other model can show the presenter); a product scene one
  // go on the backup model. A second failure of either fails the render (refunded).
  const presenter = (i: number) => out.models[i] === PRESENTER_MODEL;
  const final = failed.find((i) => (presenter(i) ? out.presenterRetried?.includes(i) : out.backups.includes(i)));
  if (final !== undefined) return { action: "fail", error: `Scene ${final + 1}: ${statuses[final].error ?? "the clip failed"}` };
  if (failed.some(presenter)) return { action: "retryPresenter", scenes: failed.filter(presenter) };
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
  await requirePlan(input.workspaceId); // making a video needs a plan (mobile L02 gate)
  // A library voice can't speak on ElevenLabs' free plan: said before anything is charged. Asked outside the locked
  // transaction below (a network call). ponytail: reads the latest plan here; the transaction re-checks the version.
  const head = await prisma.contentVersion.findFirst({ where: { contentItemId: input.itemId, item: { workspaceId: input.workspaceId, brandId: input.brandId } }, orderBy: { version: "desc" }, select: { body: true } });
  if ((head?.body as { voice?: string } | null)?.voice?.startsWith("library:") && !(await libraryUsable())) throw new PublishingError("This library voice can be used once our ElevenLabs plan is upgraded. Pick another voice for now.", 400);
  const scope = { workspaceId: input.workspaceId, brandId: input.brandId };
  const loaded = await prisma.$transaction(async (tx) => {
    await lock(tx, input.itemId);
    const item = await tx.contentItem.findFirst({ where: { id: input.itemId, ...scope, studio: true }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    const latest = item?.versions[0];
    if (!item || !latest) throw new PublishingError("Reel not found", 404);
    const running = await tx.reelRender.findFirst({ where: { contentItemId: item.id, step: { in: [...ACTIVE] } } });
    if (running) return { running };
    if (latest.version !== input.version) throw new PublishingError("A newer plan exists. Review it, then make the video.");
    if (["SCHEDULED", "PUBLISHED"].includes(item.status)) throw new PublishingError("This reel is already scheduled or posted.", 409);
    const parsed = ReelPlan.safeParse(latest.body);
    if (!parsed.success) throw new PublishingError("This plan isn't complete yet", 400);
    const problems = [...planProblems(parsed.data, scope), ...(await planOwnershipProblems(parsed.data, scope, tx)), ...(await recordingProblems(parsed.data, item.id)), ...standInProblems(parsed.data), ...parsed.data.scenes.flatMap((s, i) => promptProblems(s.prompt ?? s.direction).map((p) => `Scene ${i + 1}: ${p}`))];
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
    // The plan may have changed while paying: render only the version that was checked and priced.
    const latest = await tx.contentVersion.findFirst({ where: { contentItemId: input.itemId }, orderBy: { version: "desc" }, select: { id: true } });
    if (latest?.id !== loaded.versionId) throw new PublishingError("A newer plan exists. Review it, then make the video.");
    const made = await tx.reelRender.create({
      data: { ...scope, contentItemId: input.itemId, contentVersionId: loaded.versionId, attempt: loaded.attempt, chargeId, webhookSecret: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "") },
    });
    // Each render that speaks with someone's cloned voice is on the audit log, with the render itself.
    if (loaded.plan.voice.startsWith("clone:"))
      await tx.auditEvent.create({ data: { ...scope, actorUserId: input.userId, action: "voice.clone.used", entityType: "Voice", entityId: loaded.plan.voice.slice("clone:".length), metadata: { renderId: made.id, itemId: input.itemId } } });
    return made;
  }, TX).catch(async (e: unknown) => {
    if ((e as { code?: string }).code === "P2002") return prisma.reelRender.findUniqueOrThrow({ where: { contentVersionId_attempt: { contentVersionId: loaded.versionId, attempt: loaded.attempt } } });
    // No render row holds this charge: give it back. ponytail: a process killed right here still keeps it; a sweep
    // for reel-render charges with no render and no refund is the fix if that ever shows up in the ledger.
    await refundCharge(input.workspaceId, chargeId);
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
  // Can't read the clips' status (Higgsfield or network down): wait, as they're still running and billed there;
  // the day-long give-up still applies. Failing here would refund a render that may well finish.
  const statuses = r.step === "CLIPS" && ids.length ? await Promise.all(ids.map((id) => higgsfield.status(id))).catch(() => null) : [];
  if (statuses === null) return Date.now() - r.createdAt.getTime() > GIVE_UP_MS ? failRender({ renderId }, new Error(GIVE_UP_ERROR), true) : enqueueTick(r, POLL_MS);
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
    case "retryPresenter":
      await retryPresenter(r, next.scenes);
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
  // Checked again here: the presenter may have been removed after the render was charged.
  const sheet = plan.presenter === "none" ? null : (await donePresenter(scope, plan.presenter))?.outputKey;
  if (plan.presenter !== "none" && !sheet) return failRender({ renderId: r.id }, new Error("Presenter removed: pick another."), true);
  // ElevenLabs scenes one after another (its shared account allows few requests at once); OpenAI's together.
  // Retries for a busy provider stop after ~2 min: the job has 300 s and a cut-off attempt would speak everything again.
  const deadline = Date.now() + 120_000;
  // A recorded scene uses its recording (already the render's WAV format); the others are spoken.
  const recorded = await recordingKeys(plan, r.contentItemId);
  const say = async (s: ReelPlan["scenes"][number]) => {
    const key = s.recordingId ? recorded.get(s.recordingId) : undefined;
    if (s.recordingId && !key) throw new Error("Recording missing: record it again.");
    if (key) {
      const res = await fetch(await signedMediaUrl(key), { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`Recording missing: couldn't read it (${res.status}). Record it again.`);
      return new Uint8Array(await res.arrayBuffer());
    }
    return speak({ text: s.voiceText, voice: plan.voice, language: plan.language, deadline, workspaceId: r.workspaceId });
  };
  const wavs: Uint8Array[] = [];
  try {
    if (isElevenVoice(plan.voice)) for (const s of plan.scenes) wavs.push(await say(s));
    else wavs.push(...(await Promise.all(plan.scenes.map(say))));
  } catch (e) {
    if (voiceRefused(e)) return failRender({ renderId: r.id }, e, true); // refunded now, not after the queue's retries
    throw e;
  }
  const scenes = await Promise.all(plan.scenes.map(async (s, i) => {
    const wav = wavs[i];
    const voiceKey = mediaKey(scope, `${randomUUID()}.wav`);
    await putMedia(voiceKey, wav, "audio/wav");
    // Kling and Seedance follow the photo's shape: crop to 9:16 first.
    const src = new Uint8Array(await (await fetch(await signedMediaUrl(s.photoKey))).arrayBuffer());
    const photoKey = mediaKey(scope, `${randomUUID()}.jpg`);
    await putMedia(photoKey, await sharp(src).resize(1080, 1920, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer(), "image/jpeg");
    const seconds = wavSeconds(wav);
    let model: ModelId = s.presenter ? PRESENTER_MODEL : (s.model ?? routeScene(s.kind ?? "detail"));
    // e.g. Hailuo stops at 10 s. Never for a presenter scene: no other model can show the presenter.
    if (!s.presenter && Math.ceil(seconds) > VIDEO_MODELS[model].maxSeconds) model = BACKUP_MODEL;
    return { voiceKey, photoKey, seconds, model };
  }));
  // A presenter line over the model's 15 s is clipped at 15 s like any scene (modelSeconds, joinClips): the plan's
  // 30-word rule keeps that rare, and failing would refuse the same text on every retry.
  const photoUrls = await Promise.all(scenes.map((s) => signedMediaUrl(s.photoKey, 24 * 3600)));
  const sheetUrl = sheet ? await signedMediaUrl(sheet, 24 * 3600) : null;
  const outputs: Outputs = {
    voiceKeys: scenes.map((s) => s.voiceKey),
    voiceSeconds: scenes.map((s) => s.seconds),
    photoKeys: scenes.map((s) => s.photoKey),
    photoUrls,
    models: scenes.map((s) => s.model),
    clipSeconds: scenes.map((s) => modelSeconds(s.model, s.seconds)),
    backups: [],
    prompts: await clipPrompts(r, plan),
    refs: await Promise.all(scenes.map(async (s, i) => (s.model === PRESENTER_MODEL && sheetUrl ? { imageUrls: [sheetUrl, photoUrls[i]], audioUrl: await signedMediaUrl(s.voiceKey, 24 * 3600) } : null))),
  };
  // ponytail: a duplicate tick that lost this race wasted one set of voice calls (cents); not worth a claim.
  await prisma.reelRender.updateMany({ where: { id: r.id, step: "VOICE" }, data: { step: "CLIPS", outputs: outputs as Prisma.InputJsonValue } });
}

const photoUrl = async (out: Outputs, i: number) => out.photoUrls?.[i] ?? signedMediaUrl(out.photoKeys[i], 24 * 3600);
/** Higgsfield refused the request itself (bad input, no balance): resending won't help. */
const refused = (e: unknown) => e instanceof Error && /^Higgsfield 4\d\d\b/.test(e.message) && !/^Higgsfield 429\b/.test(e.message);
const SUBMIT_TRIES = 3;

async function submitClips(r: ReelRender) {
  const claim = await prisma.reelRender.updateMany({ where: { id: r.id, step: "CLIPS", claimedAt: r.claimedAt }, data: { claimedAt: new Date() } });
  if (claim.count !== 1) return;
  const plan = await planOf(r);
  const out = r.outputs as Outputs & { submitErrors?: number };
  const prompts = out.prompts ?? (await clipPrompts(r, plan));
  try {
    const ids = await Promise.all(plan.scenes.map(async (_, i) =>
      higgsfield.animate({ model: out.models[i], photoUrl: await photoUrl(out, i), prompt: prompts[i], seconds: out.clipSeconds[i], ...out.refs?.[i], webhook: webhookFor(r), idempotencyKey: `${r.id}:clip:${i}` }),
    ));
    await prisma.reelRender.update({ where: { id: r.id }, data: { requests: { CLIPS: ids }, claimedAt: null } });
  } catch (e) {
    // Fail fast instead of waiting a day: a refusal at once, anything else after a few tries.
    const tries = (out.submitErrors ?? 0) + 1;
    if (refused(e) || tries >= SUBMIT_TRIES) return failRender({ renderId: r.id }, e, true);
    await prisma.reelRender.update({ where: { id: r.id }, data: { claimedAt: null, outputs: { ...out, submitErrors: tries } as Prisma.InputJsonValue } });
  }
}

/** A presenter scene's prompt names the product it stands next to (its photo's title); product scenes keep the director's. */
async function clipPrompts(r: ReelRender, plan: ReelPlan) {
  const photos = plan.scenes.some((s) => s.presenter) ? await productPhotos(r.workspaceId, r.brandId) : [];
  return plan.scenes.map((s) => {
    if (!s.presenter) return s.prompt ?? s.direction;
    const product = photos.find((p) => p.key === s.photoKey)?.title ?? "the product";
    return `The person in image 1 speaks to camera, warm and natural, next to ${product} shown in image 2, lips in sync with the audio. Keep the person's face and the product exactly as in the images. Vertical 9:16, soft daylight.`;
  });
}

/** One more go for failed presenter scenes, on the same model with the same references (a new key, so a new job). */
async function retryPresenter(r: ReelRender, scenes: number[]) {
  const plan = await planOf(r);
  const out = r.outputs as Outputs;
  const prompts = out.prompts ?? (await clipPrompts(r, plan));
  const ids = [...((r.requests as Requests).CLIPS ?? [])];
  for (const i of scenes) {
    ids[i] = await higgsfield.animate({ model: out.models[i], photoUrl: await photoUrl(out, i), prompt: prompts[i], seconds: out.clipSeconds[i], ...out.refs?.[i], webhook: webhookFor(r), idempotencyKey: `${r.id}:clip:${i}:retry` });
    out.presenterRetried = [...(out.presenterRetried ?? []), i];
  }
  await prisma.reelRender.update({ where: { id: r.id }, data: { requests: { CLIPS: ids }, outputs: out as Prisma.InputJsonValue } });
}

async function retryOnBackup(r: ReelRender, scenes: number[]) {
  const plan = await planOf(r);
  const out = r.outputs as Outputs;
  const ids = [...((r.requests as Requests).CLIPS ?? [])];
  for (const i of scenes) {
    const seconds = modelSeconds(BACKUP_MODEL, out.voiceSeconds[i]);
    ids[i] = await higgsfield.animate({ model: BACKUP_MODEL, photoUrl: await photoUrl(out, i), prompt: plan.scenes[i].prompt ?? plan.scenes[i].direction, seconds, webhook: webhookFor(r), idempotencyKey: `${r.id}:clip:${i}:backup` });
    out.models[i] = BACKUP_MODEL;
    out.clipSeconds[i] = seconds;
    out.backups.push(i);
  }
  await prisma.reelRender.update({ where: { id: r.id }, data: { requests: { CLIPS: ids }, outputs: out as Prisma.InputJsonValue } });
}

async function join(r: ReelRender, urls: string[]) {
  const out = { ...(r.outputs as Outputs), clipUrls: urls };
  // One join at a time: CLIPS→JOIN, or re-claiming a JOIN whose claim went stale (a crashed join).
  const claimed = r.step === "CLIPS"
    ? await prisma.reelRender.updateMany({ where: { id: r.id, step: "CLIPS" }, data: { step: "JOIN", outputs: out as Prisma.InputJsonValue, claimedAt: new Date() } })
    : await prisma.reelRender.updateMany({ where: { id: r.id, step: "JOIN", claimedAt: r.claimedAt }, data: { claimedAt: new Date() } });
  if (claimed.count !== 1) return;
  const scope = { workspaceId: r.workspaceId, brandId: r.brandId };
  const dir = await mkdtemp(path.join(tmpdir(), "reel-"));
  let made: boolean;
  try {
    made = await joinClips(r, out, urls, scope, dir);
  } catch (e) {
    // Release the claim so the queue's retry joins again at once; give up (and refund) after a few failures,
    // e.g. clip links that expired or a clip ffmpeg can't read.
    const tries = (out.joinErrors ?? 0) + 1;
    if (tries >= JOIN_TRIES) return failRender({ renderId: r.id }, e, true);
    await prisma.reelRender.updateMany({ where: { id: r.id, step: "JOIN" }, data: { claimedAt: null, outputs: { ...out, joinErrors: tries } as Prisma.InputJsonValue } });
    throw e;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
  if (made) {
    // Same input shape as recheckQuality (itemId + the new version), so its in-flight test sees this run. A missed start is retried by the app's recheck.
    const latest = await prisma.contentVersion.findFirst({ where: { contentItemId: r.contentItemId }, orderBy: { version: "desc" }, select: { version: true } });
    await startAgentRun({ ...scope, agentKey: "quality", trigger: "event", input: { itemId: r.contentItemId, version: latest?.version } }).catch(() => null);
  }
  await notifyStarter(r, true);
}

async function joinClips(r: ReelRender, out: Outputs, urls: string[], scope: { workspaceId: string; brandId: string }, dir: string) {
  // Each scene lasts as long as its voice (rounded up); longer clips are trimmed to it.
  // A presenter clip is at least 4 s (and priced so): its scene keeps that length.
  const sceneSeconds = out.voiceSeconds.map((v, i) => (out.models[i] === PRESENTER_MODEL ? Math.max(PRESENTER_MIN_SECONDS, clipSeconds(v)) : clipSeconds(v)));
  const clips = await Promise.all(urls.map(async (u, i) => {
    const file = path.join(dir, `clip${i}.mp4`);
    await writeFile(file, await fetchResult(u));
    return { file, seconds: Math.min(sceneSeconds[i], out.clipSeconds[i]) };
  }));
  // Look at every join before joining: a seam that doesn't read as one film is softened to a dissolve.
  const plan = await planOf(r);
  // In a reel with a presenter every join is a cut (a dissolve between a face and a product reads as a glitch).
  const seams = plan.presenter !== "none"
    ? clips.slice(1).map((_, i): Seam => ({ after: i + 1, planned: "cut", used: "cut", fits: null, note: "Presenter reel: cuts only" }))
    : await Promise.all(clips.slice(1).map((_, i) => checkJoin(scope, plan.scenes[i].transition ?? "cut", clips[i].file, clips[i + 1].file, dir, i)));
  const joined = clips.map((c, i) => ({ ...c, transition: seams[i]?.used }));
  const voices = await Promise.all(out.voiceKeys.map(async (k) => new Uint8Array(await (await fetch(await signedMediaUrl(k))).arrayBuffer())));
  const wav = path.join(dir, "voice.wav");
  await writeFile(wav, padAndJoinWav(voices, joined.map((c) => c.seconds)));
  const mp4 = path.join(dir, "reel.mp4");
  const reencode = needsReencode(joined.map((c, i) => ({ model: out.models[i], clip: out.clipSeconds[i], scene: c.seconds, transition: c.transition })));
  const mark = needsAiDisclosure(plan) ? path.join(dir, "ai-mark.png") : undefined;
  if (mark) await writeFile(mark, await aiMarkPng(aiDisclosureLine(plan.language)));
  await joinReel(joined, wav, mp4, { reencode, mark });
  const videoKey = mediaKey(scope, `${randomUUID()}.mp4`);
  await putMedia(videoKey, await readFile(mp4), "video/mp4");

  return prisma.$transaction(async (tx) => {
    await lock(tx, r.contentItemId);
    const item = await tx.contentItem.findFirst({ where: { id: r.contentItemId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    const latest = item?.versions[0];
    if (!item || !latest) throw new Error("The reel was deleted while rendering");
    // Only the join that still holds the step publishes; a render marked failed (and refunded) meanwhile writes nothing.
    const done = await tx.reelRender.updateMany({ where: { id: r.id, step: "JOIN" }, data: { step: "DONE", videoKey, error: null, claimedAt: null, outputs: { ...out, seams } as Prisma.InputJsonValue } });
    if (done.count !== 1) throw new Error("This render is no longer joining");
    // Scheduled or posted while it rendered: that post stands. A new version would void its approval (and, scheduled,
    // jump the item to AWAITING_APPROVAL at post time with no Quality check for it), so the video stays on the render.
    if (item.status === "SCHEDULED" || item.status === "PUBLISHED") return false;
    await tx.contentVersion.create({ data: { contentItemId: item.id, version: latest.version + 1, body: { ...(latest.body as object), videoKey }, createdBy: "agent" } });
    await tx.contentItem.update({ where: { id: item.id }, data: { status: "DRAFT_REVIEW" } });
    return true;
  }, TX);
}

/** The small "Made with AI" mark burned into presenter and cloned-voice reels (a rounded label, white on dark). */
export const aiMarkPng = (line: string) =>
  sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="72"><rect width="300" height="72" rx="20" fill="rgba(0,0,0,0.55)"/><text x="150" y="47" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" font-weight="600" fill="#fff">${line.replace(/\.$/, "").replace(/'/g, "&#39;")}</text></svg>`)).png().toBuffer();

/**
 * The seam check for one join: the last frame of a scene and the first of the next, judged by a light vision model.
 * A join that doesn't fit becomes a dissolve. A failed check never stops the reel: the planned transition stands.
 */
async function checkJoin(scope: { workspaceId: string; brandId: string }, planned: Transition, from: string, to: string, dir: string, i: number): Promise<Seam> {
  try {
    const frames = [path.join(dir, `seam${i}-end.jpg`), path.join(dir, `seam${i}-start.jpg`)];
    await Promise.all([frameOf(from, "last", frames[0]), frameOf(to, "first", frames[1])]);
    const [a, b] = await Promise.all(frames.map(async (f) => `data:image/jpeg;base64,${(await readFile(f)).toString("base64")}`));
    const verdict = await checkSeam(scope, [a, b]);
    return { after: i + 1, planned, used: verdict.fits ? planned : "dissolve", fits: verdict.fits, note: verdict.note.slice(0, 200) };
  } catch (e) {
    return { after: i + 1, planned, used: planned, fits: null, note: `Not checked: ${e instanceof Error ? e.message.slice(0, 150) : "error"}` };
  }
}

/** Job onFailure, and the step machine's own give-up: mark failed once, refund once. */
export async function failRender(payload: unknown, error: unknown, exhausted: boolean) {
  if (!exhausted) return;
  const { renderId } = payload as { renderId: string };
  const message = error instanceof Error ? error.message : String(error);
  // One transaction: a render is never FAILED without its refund (a crash in between would lose it for good,
  // since a retry finds the render already failed).
  const failed = await prisma.$transaction(async (tx) => {
    const moved = await tx.reelRender.updateMany({ where: { id: renderId, step: { in: [...ACTIVE] } }, data: { step: "FAILED", error: message.slice(0, 500), claimedAt: null } });
    if (moved.count !== 1) return null;
    const r = await tx.reelRender.findUniqueOrThrow({ where: { id: renderId } });
    await refundCharge(r.workspaceId, r.chargeId, tx);
    await tx.auditEvent.create({ data: { workspaceId: r.workspaceId, brandId: r.brandId, action: "reel.render.failed", entityType: "ReelRender", entityId: r.id, metadata: { error: message.slice(0, 500), attempt: r.attempt } } });
    return r;
  }, TX);
  if (failed) await notifyStarter(failed, false);
}

/** Push to the phones of whoever started the render (the person on its charge), once it's done or has failed. */
async function notifyStarter(r: Pick<ReelRender, "workspaceId" | "chargeId" | "contentItemId">, ok: boolean) {
  try {
    const [charge, item] = await Promise.all([
      prisma.creditEntry.findFirst({ where: { workspaceId: r.workspaceId, reason: "reel-render", refId: r.chargeId }, select: { userId: true } }),
      prisma.contentItem.findUnique({ where: { id: r.contentItemId }, select: { title: true } }),
    ]);
    if (charge?.userId) await notifyReelFinished(charge.userId, { itemId: r.contentItemId, title: item?.title ?? "", ok });
  } catch (e) {
    console.warn("[push] couldn't find who to notify:", e instanceof Error ? e.message : e); // the reel itself is fine
  }
}

/**
 * What the app may show about a failed render: a kind it words in the person's language. The provider's own message
 * ("Higgsfield 403: not_enough_credits") stays in the row and the audit log for admins, never on a customer's screen.
 */
export type RenderFailure = { kind: "unavailable" | "slow" | "scene" | "voiceDeleted" | "other"; scene?: number; stoppedAt: "VOICE" | "CLIPS" | "JOIN" };
export function renderFailure(r: Pick<ReelRender, "step" | "error" | "requests" | "outputs">): RenderFailure | null {
  if (r.step !== "FAILED") return null;
  const raw = r.error ?? "";
  const out = (r.outputs ?? {}) as Partial<Outputs>;
  const stoppedAt = out.clipUrls ? "JOIN" : (r.requests as Requests).CLIPS?.length || out.voiceKeys ? "CLIPS" : "VOICE";
  // Our account with a provider (out of credit, key refused, not set up): nothing the person can fix.
  if (/^(Higgsfield (401|402|403)|OpenAI (401|402|403)|ElevenLabs (401|402|403|429)|Voiceover failed \((401|402|403)\))|not_enough_credits|quota_exceeded|isn't set up/i.test(raw)) return { kind: "unavailable", stoppedAt };
  if (/^Unknown voice |voice_not_found/.test(raw)) return { kind: "voiceDeleted", stoppedAt };
  if (/more than a day/.test(raw)) return { kind: "slow", stoppedAt };
  const scene = /^Scene (\d+):/.exec(raw);
  if (scene) return { kind: "scene", scene: Number(scene[1]), stoppedAt };
  return { kind: "other", stoppedAt };
}

/** For the app: each version's latest render. */
export async function renderView(itemId: string) {
  const renders = await prisma.reelRender.findMany({ where: { contentItemId: itemId }, orderBy: { createdAt: "desc" }, take: 20 });
  // What each attempt was charged (its charge entry; 0 in a workspace with unlimited credits).
  const charges = await prisma.creditEntry.findMany({ where: { refId: { in: renders.map((r) => r.chargeId) }, delta: { lte: 0 } }, select: { refId: true, delta: true } });
  const charged = (r: ReelRender) => {
    const c = charges.find((e) => e.refId === r.chargeId);
    return c ? -c.delta : null;
  };
  // Joins the seam check softened, so R07 can say so (its reason stays here: it's the model's English note).
  const softened = (r: ReelRender) => ((r.outputs as Partial<Outputs> | null)?.seams ?? []).filter((s) => s.used !== s.planned).map((s) => s.after);
  return renders.map((r) => ({ id: r.id, versionId: r.contentVersionId, attempt: r.attempt, step: r.step, failure: renderFailure(r), softened: softened(r), videoKey: r.videoKey, credits: charged(r), createdAt: r.createdAt }));
}
