import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { effectivePermissions } from "@/server/auth/permissions";
import { prisma } from "@/server/db/prisma";
import { enqueueJob } from "@/server/jobs/queue";
import { isM4a, toWav } from "@/server/reels/recordings";
import { wavSeconds } from "@/server/reels/wav";
import { refundCharge, spendCredits } from "@/server/services/credits";
import { PublishingError } from "@/server/services/publishing";
import { requirePlan } from "@/server/services/subscriptions";
import { deleteMedia, putMedia } from "@/server/storage/media";

/**
 * Cloned voices (mobile Voices → Clone a voice): a workspace member with voices.manage reads a passage, ticks the
 * consent box, and ElevenLabs makes an instant clone the whole workspace may use (at most 2 live). The audio is never
 * written to our storage or logs: it is converted in a temp dir deleted straight after (recordings.ts toWav), then
 * sent to ElevenLabs, which keeps it with the voice until the voice is deleted.
 * In a plan a clone is "clone:<Voice.id>" (voice.ts speaks it); its ElevenLabs id never leaves the server.
 */
export const CLONE_CREDITS = 10; // ponytail: placeholder price until ElevenLabs Starter's real cost per clone is known
export const MAX_CLONES = 2;
export const MAX_CLONE_BYTES = 4 * 1024 * 1024;
export const CLONE_SECONDS = { min: 60, max: 90 };
export const CONSENT_VERSION = "2026-11-12";
export const CONSENT_TEXT =
  "This is my own voice. I agree to it being used in videos made by this workspace. It is processed by ElevenLabs (USA) to create the voice and by Higgsfield to make presenter videos.";
export const VOICE_DELETE_JOB = "voices.delete";
export const cloneVoiceId = (id: string) => `clone:${id}`;

const EL = "https://api.elevenlabs.io/v1";
const key = () => {
  if (!process.env.ELEVENLABS_API_KEY) throw new PublishingError("Voice cloning isn't available yet.", 503);
  return process.env.ELEVENLABS_API_KEY;
};

/** Our ElevenLabs plan allows instant clones (the free plan doesn't). */
async function canClone() {
  const res = await fetch(`${EL}/user`, { headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return false;
  return !!((await res.json()) as { subscription?: { can_use_instant_voice_cloning?: boolean } }).subscription?.can_use_instant_voice_cloning;
}

type Scope = { workspaceId: string; brandId: string; userId: string };
type Db = Prisma.TransactionClient | typeof prisma;
const audit = (db: Db, workspaceId: string, actorUserId: string | null, action: string, voiceId: string, metadata: object = {}) =>
  db.auditEvent.create({ data: { workspaceId, actorUserId, action, entityType: "Voice", entityId: voiceId, metadata } });

/**
 * Makes a clone: checks the take (same audio checks as recordings, 60–90 s) and our ElevenLabs plan, reserves one of
 * the workspace's two places under a lock, charges, then asks ElevenLabs. A failure gives the place and credits back.
 */
export async function createClone(scope: Scope, input: { name: string; bytes: Uint8Array; consent: boolean; appVersion?: string }) {
  if (!input.consent) throw new PublishingError("Tick the box to confirm this is your own voice.", 400);
  await requirePlan(scope.workspaceId);
  if (input.bytes.length > MAX_CLONE_BYTES || !isM4a(input.bytes)) throw new PublishingError("That recording couldn't be read. Record it again.", 400);
  const wav = await toWav(input.bytes, CLONE_SECONDS.max + 1);
  const seconds = wavSeconds(wav);
  if (seconds < CLONE_SECONDS.min - 1 || seconds > CLONE_SECONDS.max + 0.25) throw new PublishingError(`Read for ${CLONE_SECONDS.min} to ${CLONE_SECONDS.max} seconds.`, 400);
  if (!(await canClone())) throw new PublishingError("Voice cloning isn't available yet.", 503);

  // A place is taken by a row being made (no provider id yet) as much as by a live one: two taps can't make a third.
  const voice = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`clones:${scope.workspaceId}`}))`;
    // A place held by a request that died (timeout, crash) for over 5 minutes is given back, with its credits. It is
    // archived, not deleted: the request may have died after ElevenLabs made the voice, so the delete job looks there.
    const abandoned = await tx.voice.findMany({ where: { workspaceId: scope.workspaceId, providerVoiceId: null, archivedAt: null, createdAt: { lt: new Date(Date.now() - 5 * 60_000) } } });
    for (const a of abandoned) {
      await archiveClone(tx, a, null, "voice.clone.abandoned");
      await refundCharge(scope.workspaceId, a.id, tx);
    }
    const live = await tx.voice.count({ where: { workspaceId: scope.workspaceId, archivedAt: null } });
    if (live >= MAX_CLONES) throw new PublishingError(`A workspace can have ${MAX_CLONES} cloned voices. Delete one first.`, 409);
    const consent = { userId: scope.userId, at: new Date().toISOString(), textVersion: CONSENT_VERSION, appVersion: input.appVersion ?? null, audioSha256: createHash("sha256").update(input.bytes).digest("hex") };
    return tx.voice.create({ data: { workspaceId: scope.workspaceId, ownerUserId: scope.userId, name: input.name, consent } });
  });
  const release = () => prisma.voice.delete({ where: { id: voice.id } }).catch(() => {});
  let chargeId: string;
  try {
    chargeId = await spendCredits({ workspaceId: scope.workspaceId, amount: CLONE_CREDITS, reason: "voice-clone", refId: voice.id, userId: scope.userId });
  } catch (e) {
    await release();
    throw e;
  }
  let providerVoiceId: string | undefined;
  try {
    const form = new FormData();
    form.append("name", `${input.name.slice(0, 40)} (${voice.id})`);
    form.append("remove_background_noise", "true");
    form.append("files", new Blob([Buffer.from(wav)], { type: "audio/wav" }), "voice.wav");
    const res = await fetch(`${EL}/voices/add`, { method: "POST", headers: { "xi-api-key": key() }, body: form, signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    providerVoiceId = ((await res.json()) as { voice_id?: string }).voice_id;
    if (!providerVoiceId) throw new Error("ElevenLabs made no voice");
    const sampleId = await fetch(`${EL}/voices/${encodeURIComponent(providerVoiceId)}`, { headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(15_000) })
      .then(async (r) => ((await r.json()) as { samples?: { sample_id?: string }[] }).samples?.[0]?.sample_id ?? null)
      .catch(() => null);
    const made = await prisma.$transaction(async (tx) => {
      // Only while it's still reserved: its owner may have been removed from the workspace meanwhile.
      const { count } = await tx.voice.updateMany({ where: { id: voice.id, archivedAt: null }, data: { providerVoiceId, consent: { ...(voice.consent as object), elevenSampleId: sampleId } } });
      if (!count) throw new PublishingError("The voice couldn't be kept: its owner left the workspace.", 409);
      await audit(tx, scope.workspaceId, scope.userId, "voice.clone.created", voice.id, { name: input.name });
      return tx.voice.findUniqueOrThrow({ where: { id: voice.id } });
    });
    // One sample for the Voices screen, made once now; a failure only means no sample to play.
    await makeSample(made).catch(() => {});
    return made;
  } catch (e) {
    // Made at ElevenLabs but not kept here: delete it there too, so no voice (or the person's audio) is left behind.
    if (providerVoiceId) await fetch(`${EL}/voices/${encodeURIComponent(providerVoiceId)}`, { method: "DELETE", headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(15_000) }).catch(() => {});
    await release();
    await refundCharge(scope.workspaceId, chargeId);
    if (e instanceof PublishingError) throw e;
    throw new PublishingError("The voice couldn't be made. Your credits are back. Try again later.", 502);
  }
}

/** Where a clone's files live: under its workspace, removed when the voice is deleted. */
const voiceFolder = (v: { workspaceId: string; id: string }) => `${v.workspaceId}/voices/${v.id}`;

async function makeSample(v: { id: string; workspaceId: string }) {
  const { speak, SAMPLE_LINE } = await import("@/server/reels/voice");
  const sampleKey = `${voiceFolder(v)}/sample.wav`;
  await putMedia(sampleKey, await speak({ text: SAMPLE_LINE, voice: cloneVoiceId(v.id), workspaceId: v.workspaceId }), "audio/wav");
  await prisma.voice.update({ where: { id: v.id }, data: { sampleKey } });
}

/** The workspace's live clones (being made ones aren't listed). */
export const liveClones = (workspaceId: string) =>
  prisma.voice.findMany({ where: { workspaceId, archivedAt: null, providerVoiceId: { not: null } }, orderBy: { createdAt: "asc" } });

/** A plan's clone voice, if it is a live clone of this workspace. */
export async function liveClone(workspaceId: string, voice: string) {
  if (!voice.startsWith("clone:")) return null;
  return prisma.voice.findFirst({ where: { id: voice.slice("clone:".length), workspaceId, archivedAt: null, providerVoiceId: { not: null } } });
}

/** Rename or delete: the voice's owner, or someone who manages the workspace's voices. Withdrawing consent: its owner. */
async function managed(scope: Scope, id: string, ownerOnly = false) {
  const v = await prisma.voice.findFirst({ where: { id, workspaceId: scope.workspaceId, archivedAt: null } });
  if (!v) throw new PublishingError("Voice not found", 404);
  const mine = v.ownerUserId === scope.userId;
  if (!mine && (ownerOnly || !(await effectivePermissions(scope.workspaceId, scope.userId)).has("voices.manage"))) throw new PublishingError("Only the voice's owner or a workspace admin can do this.", 403);
  return v;
}

export async function renameClone(scope: Scope, id: string, name: string) {
  const v = await managed(scope, id);
  await prisma.$transaction(async (tx) => {
    await tx.voice.update({ where: { id: v.id }, data: { name } });
    await audit(tx, scope.workspaceId, scope.userId, "voice.clone.renamed", v.id, { from: v.name, to: name });
  });
}

/** Archives the voice and queues its deletion at ElevenLabs in the same transaction, so the deletion can't be lost. */
export async function archiveClone(db: Db, v: { id: string; workspaceId: string }, actorUserId: string | null, action: string) {
  await db.voice.update({ where: { id: v.id }, data: { archivedAt: new Date() } });
  await enqueueJob({ type: VOICE_DELETE_JOB, workspaceId: v.workspaceId, payload: { voiceId: v.id }, maxAttempts: 8, idempotencyKey: `voice:${v.id}:delete` }, db);
  await audit(db, v.workspaceId, actorUserId, action, v.id);
}

export async function deleteClone(scope: Scope, id: string, withdraw = false) {
  const v = await managed(scope, id, withdraw);
  await prisma.$transaction((tx) => archiveClone(tx, v, scope.userId, withdraw ? "voice.clone.consent_withdrawn" : "voice.clone.deleted"));
}

/** A member removed from the workspace: their clones go with them (called inside removeMember's transaction). */
export async function archiveMemberClones(tx: Prisma.TransactionClient, workspaceId: string, userId: string, actorUserId: string) {
  const mine = await tx.voice.findMany({ where: { workspaceId, ownerUserId: userId, archivedAt: null } });
  for (const v of mine) await archiveClone(tx, v, actorUserId, "voice.clone.owner_removed");
}

/**
 * Job: deletes an archived voice at ElevenLabs (gone already counts) and its files with us. Retried by the queue.
 * ponytail: our folder holds only sample.wav today; list and delete the prefix if more files ever go there.
 */
export async function runVoiceDelete(payload: unknown) {
  const v = await prisma.voice.findUnique({ where: { id: (payload as { voiceId: string }).voiceId } });
  if (!v?.archivedAt) return;
  // Never saved here (the request died after ElevenLabs made it, or before): find it there by the id in its name.
  const ids = v.providerVoiceId ? [v.providerVoiceId] : await voicesNamedFor(v.id);
  for (const id of ids) {
    const res = await fetch(`${EL}/voices/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok && res.status !== 404) throw new Error(`ElevenLabs ${res.status}: couldn't delete the voice`);
  }
  if (v.sampleKey) await deleteMedia(v.sampleKey);
  await prisma.voice.update({ where: { id: v.id }, data: { providerVoiceId: null, sampleKey: null } });
}

/** ElevenLabs voices made for this row: createClone names each one "<name> (<Voice.id>)". */
async function voicesNamedFor(voiceId: string) {
  const res = await fetch(`${EL}/voices`, { headers: { "xi-api-key": key() }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: couldn't list voices`);
  const { voices = [] } = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
  return voices.filter((x) => x.name.endsWith(`(${voiceId})`)).map((x) => x.voice_id);
}

/**
 * Job onFailure: a delete that used up its 8 tries (about an hour: an ElevenLabs outage, a missing key) is queued again
 * in 6 hours, with an audit event, so a withdrawn voice is never left at ElevenLabs for good.
 * ponytail: it keeps retrying every 6 h until it succeeds; an alert to an admin is the upgrade if these pile up.
 */
export async function onVoiceDeleteFailure(payload: unknown, error: unknown, exhausted: boolean) {
  if (!exhausted) return;
  const { voiceId } = payload as { voiceId: string };
  const v = await prisma.voice.findUnique({ where: { id: voiceId } });
  if (!v?.archivedAt) return; // the job only fails before its last write, so an archived voice still has work left
  const runAt = new Date(Date.now() + 6 * 3600_000);
  await enqueueJob({ type: VOICE_DELETE_JOB, workspaceId: v.workspaceId, payload: { voiceId }, runAt, maxAttempts: 8, idempotencyKey: `voice:${voiceId}:delete:${runAt.getTime()}` });
  await audit(prisma, v.workspaceId, null, "voice.clone.delete_failed", voiceId, { error: String(error).slice(0, 300), retryAt: runAt.toISOString() });
}

/** Whether this person may clone (the Voices screen shows the button only then). */
export const canManageVoices = async (workspaceId: string, userId: string) => (await effectivePermissions(workspaceId, userId)).has("voices.manage");
