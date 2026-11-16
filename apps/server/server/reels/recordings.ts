import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/server/db/prisma";
import { run } from "@/server/reels/join";
import type { ReelPlan } from "@/server/reels/plan";
import { wavSeconds } from "@/server/reels/wav";
import { PublishingError } from "@/server/services/publishing";
import { deleteMedia, mediaKey, putMedia } from "@/server/storage/media";

/**
 * Voiceovers the person records for reel scenes (mobile R11). The phone uploads an M4A; the server checks its bytes,
 * converts it to the render's WAV (24 kHz mono 16-bit, as the OpenAI and ElevenLabs voices), measures it, has
 * speech-to-text hear it, and keeps a ReelRecording row. A scene then names the row (recordingId); its length is the
 * row's, written into the plan by the server (the phone's value is never trusted).
 */
export const MAX_RECORDING_BYTES = 1024 * 1024; // 15 s of AAC at 128 kbps is ~250 KB
export const MAX_RECORDING_SECONDS = 15;
const RETENTION_DAYS = 30;

/** An MP4/M4A container: "ftyp" at offset 4 and an audio-capable brand. */
export function isM4a(b: Uint8Array) {
  const text = (from: number, to: number) => String.fromCharCode(...b.subarray(from, to));
  return b.length > 12 && text(4, 8) === "ftyp" && /^(M4A |isom|mp42|mp41|iso[2-6]|dash|3gp\d)$/.test(text(8, 12));
}

/** Words for comparing a script with what was heard: lower case, no accents or punctuation. */
const words = (t: string) =>
  t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, " ").split(/\s+/).filter(Boolean);

/** Whether a transcript says the script: at least 80 % of each side's words found in the other. */
export function saysTheScript(script: string, transcript: string) {
  const a = words(script);
  const b = words(transcript);
  if (!a.length || !b.length) return false;
  const found = (from: string[], into: string[]) => {
    const left = [...into];
    return from.filter((w) => {
      const i = left.indexOf(w);
      if (i < 0) return false;
      left.splice(i, 1);
      return true;
    }).length / from.length;
  };
  return Math.min(found(a, b), found(b, a)) >= 0.8;
}

async function transcribe(wav: Uint8Array, language?: string) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Speech-to-text isn't set up on this server (OPENAI_API_KEY is missing).");
  const form = new FormData();
  form.append("model", "gpt-4o-mini-transcribe");
  form.append("file", new Blob([Buffer.from(wav)], { type: "audio/wav" }), "voice.wav");
  if (language) form.append("language", language.split("-")[0]);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }, body: form, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`Speech-to-text failed (${res.status})`);
  return ((await res.json()) as { text?: string }).text?.trim() ?? "";
}

/**
 * M4A bytes → the render's WAV, in a temp dir of its own (deleted after). Reads the first audio track, at most
 * `maxSeconds` (a second over the limit, so an over-long take is measured and refused, not silently cut).
 */
export async function toWav(bytes: Uint8Array, maxSeconds = MAX_RECORDING_SECONDS + 1) {
  const dir = await mkdtemp(path.join(tmpdir(), "rec-"));
  try {
    const input = path.join(dir, "in.m4a");
    const output = path.join(dir, "out.wav");
    await writeFile(input, bytes);
    await run(["-nostdin", "-y", "-protocol_whitelist", "file", "-f", "mp4", "-i", input, "-t", String(maxSeconds), "-vn", "-map", "0:a:0", "-ar", "24000", "-ac", "1", "-c:a", "pcm_s16le", output], 20_000).catch(() => {
      throw new PublishingError("That recording couldn't be read. Record it again.", 400);
    });
    return new Uint8Array(await readFile(output));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

type Scope = { workspaceId: string; brandId: string; userId: string };

/** POST …/reels/{id}/recordings: one take for one scene's text. `matches`: whether what was heard is that text. */
export async function uploadRecording(scope: Scope, itemId: string, input: { bytes: Uint8Array; text: string; language?: string }) {
  const item = await prisma.contentItem.findFirst({ where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId, studio: true }, select: { id: true } });
  if (!item) throw new PublishingError("Reel not found", 404);
  if (!isM4a(input.bytes)) throw new PublishingError("That recording couldn't be read. Record it again.", 400);
  const wav = await toWav(input.bytes);
  // Rounded up, never down: the render ceils the exact length, and the price must cover what it renders.
  const seconds = Math.ceil(wavSeconds(wav) * 100) / 100;
  // The phone stops a take at 15 s, which can measure a few hundredths over: a quarter second of slack (the scene is
  // still 15 s; the render trims the voice to it).
  if (seconds > MAX_RECORDING_SECONDS + 0.25) throw new PublishingError("Keep it under 15 seconds.", 400);
  if (seconds < 0.5) throw new PublishingError("That recording is empty. Record it again.", 400);
  const transcript = await transcribe(wav, input.language);
  const key = mediaKey(scope, `rec-${randomUUID()}.wav`);
  await putMedia(key, wav, "audio/wav");
  const row = await prisma.reelRecording.create({ data: { workspaceId: scope.workspaceId, contentItemId: itemId, key, seconds, text: input.text, transcript, uploadedByUserId: scope.userId } });
  return { id: row.id, seconds, transcript, matches: saysTheScript(input.text, transcript) };
}

/**
 * Recordings follow their text, not their position. A revision from the scriptwriter (it writes no recordingId)
 * keeps a recording on a scene whose text is the recorded scene's text. Then every recorded scene is checked against
 * its row: it keeps it only while its text is what was read or what was heard ("Keep it"); its seconds are the row's.
 * Returns the plan, the scene numbers whose recording was dropped (the app words it) and a notice per drop (the chat).
 */
export async function settleRecordings(plan: ReelPlan, previous: ReelPlan | undefined, itemId: string, fromScriptwriter: boolean) {
  const carried = fromScriptwriter
    ? plan.scenes.map((s) => {
        const old = previous?.scenes.find((p) => p.recordingId && p.voiceText === s.voiceText);
        return old ? { ...s, recordingId: old.recordingId } : s;
      })
    : plan.scenes;
  const ids = [...new Set(carried.flatMap((s) => s.recordingId ?? []))];
  const rows = ids.length ? await prisma.reelRecording.findMany({ where: { id: { in: ids }, contentItemId: itemId } }) : [];
  const dropped: number[] = [];
  const scenes = carried.map((s, i) => {
    if (!s.recordingId) return { ...s, recordingSeconds: undefined };
    const row = rows.find((r) => r.id === s.recordingId);
    // On the asked text only if the take says it; otherwise only once the text is what was said ("Keep it"), so
    // approvers and Quality read what is spoken.
    if (row && (s.voiceText === row.transcript || (s.voiceText === row.text && saysTheScript(row.text, row.transcript)))) return { ...s, recordingSeconds: row.seconds };
    if (row) dropped.push(i + 1);
    return { ...s, recordingId: undefined, recordingSeconds: undefined };
  });
  return { plan: { ...plan, scenes }, dropped, notices: dropped.map((n) => `Scene ${n}: recording removed, the text changed.`) };
}

/** Before a render is charged: every recording the plan names is this reel's, with the length the plan prices. */
export async function recordingProblems(plan: ReelPlan, itemId: string) {
  const ids = plan.scenes.flatMap((s) => s.recordingId ?? []);
  if (!ids.length) return [];
  const rows = await prisma.reelRecording.findMany({ where: { id: { in: ids }, contentItemId: itemId } });
  return plan.scenes.flatMap((s, i) => {
    if (!s.recordingId) return [];
    const row = rows.find((r) => r.id === s.recordingId);
    return row && row.seconds === s.recordingSeconds ? [] : [`Scene ${i + 1}'s recording is missing. Record it again.`];
  });
}

/** The recorded scenes' WAV keys, for the render (scoped to the reel). */
export async function recordingKeys(plan: ReelPlan, itemId: string) {
  const ids = plan.scenes.flatMap((s) => s.recordingId ?? []);
  const rows = ids.length ? await prisma.reelRecording.findMany({ where: { id: { in: ids }, contentItemId: itemId } }) : [];
  return new Map(rows.map((r) => [r.id, r.key]));
}

/**
 * Daily sweep: recordings older than 30 days that no version of their reel uses are deleted with their audio.
 * ponytail: reads each old row's versions; fine at today's volume, a JSON index if the table grows large.
 */
export async function purgeOldRecordings(now = Date.now()) {
  const before = new Date(now - RETENTION_DAYS * 86400_000);
  let after: string | undefined;
  for (;;) {
    const old = await prisma.reelRecording.findMany({ where: { createdAt: { lt: before }, ...(after ? { id: { gt: after } } : {}) }, orderBy: { id: "asc" }, take: 500 });
    if (!old.length) return;
    after = old[old.length - 1].id;
    for (const r of old) {
      // Kept while any version of the reel uses it (an older version may still be rendered or restored).
      const versions = await prisma.contentVersion.findMany({ where: { contentItemId: r.contentItemId }, select: { body: true } });
      if (versions.some((v) => ((v.body as { scenes?: { recordingId?: string }[] } | null)?.scenes ?? []).some((s) => s.recordingId === r.id))) continue;
      await prisma.reelRecording.delete({ where: { id: r.id } });
      await deleteMedia(r.key).catch(() => {}); // an orphaned file costs storage only
    }
  }
}
