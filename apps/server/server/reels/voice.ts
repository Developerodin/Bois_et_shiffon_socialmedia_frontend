/**
 * Reel voiceover, one WAV per scene (Higgsfield's API has no voice models): OpenAI text-to-speech, or ElevenLabs.
 * Voice ids: a bare name is an OpenAI voice ("coral"); "eleven:<voiceId>" is an ElevenLabs stock voice;
 * "clone:<Voice.id>" is one of the workspace's cloned voices (clones.ts); "library:<voiceId>" is a voice from
 * ElevenLabs' public library (library.ts). Only stock voices, library voices and the workspace's live clones are
 * accepted, so no other ElevenLabs voice, public or another customer's, can be used; an unknown or
 * archived voice throws instead of silently becoming another one.
 * WAV so the length can be read without a decoder (wav.ts) and scenes can be padded and joined as raw PCM; both
 * providers give 24 kHz mono 16-bit, so their scenes join.
 */
import { liveClone, liveClones } from "@/server/reels/clones";
import { isLibraryVoice } from "@/server/reels/library";
import { languageName } from "@/server/reels/plan";
import { pcmWav } from "@/server/reels/wav";
import { mediaKnown, signedMediaUrl } from "@/server/storage/media";

export const REEL_VOICES = ["coral", "sage", "ash", "ballad", "verse"] as const;

export type StockVoice = { id: string; name: string; gender: "female" | "male" | "neutral"; provider: "openai" | "elevenlabs"; previewUrl?: string };

/** OpenAI's five, then a few ElevenLabs premade voices (multilingual; preview links from GET /v1/voices, 2026-11-12). */
export const STOCK_VOICES: StockVoice[] = [
  { id: "coral", name: "Coral", gender: "female", provider: "openai" },
  { id: "sage", name: "Sage", gender: "female", provider: "openai" },
  { id: "ash", name: "Ash", gender: "male", provider: "openai" },
  { id: "ballad", name: "Ballad", gender: "male", provider: "openai" },
  { id: "verse", name: "Verse", gender: "male", provider: "openai" },
  { id: "eleven:EXAVITQu4vr4xnSDxMaL", name: "Sarah", gender: "female", provider: "elevenlabs", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/01a3e33c-6e99-4ee7-8543-ff2216a32186.mp3" },
  { id: "eleven:Xb7hH8MSUJpSbSDYk0k2", name: "Alice", gender: "female", provider: "elevenlabs", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/Xb7hH8MSUJpSbSDYk0k2/d10f7534-11f6-41fe-a012-2de1e482d336.mp3" },
  { id: "eleven:hpp4J3VqNfWAUOO0d1Us", name: "Bella", gender: "female", provider: "elevenlabs", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/hpp4J3VqNfWAUOO0d1Us/dab0f5ba-3aa4-48a8-9fad-f138fea1126d.mp3" },
  { id: "eleven:cjVigY5qzO86Huf0OWal", name: "Eric", gender: "male", provider: "elevenlabs", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/cjVigY5qzO86Huf0OWal/d098fda0-6456-4030-b3d8-63aa048c9070.mp3" },
  { id: "eleven:iP95p4xoKVk53GoZ742B", name: "Chris", gender: "male", provider: "elevenlabs", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/iP95p4xoKVk53GoZ742B/3f4bde72-cc48-40dd-829f-57fbf906f4d7.mp3" },
  { id: "eleven:SAz9YHcvj6GT2YYXdXww", name: "River", gender: "neutral", provider: "elevenlabs", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/SAz9YHcvj6GT2YYXdXww/e6c95f0b-2227-491a-b3d7-2249240decb7.mp3" },
];
export const isStockVoice = (id: string) => STOCK_VOICES.some((v) => v.id === id);
/** Spoken by ElevenLabs (stock, library or a clone): one scene at a time. */
export const isElevenVoice = (id: string) => id.startsWith("eleven:") || id.startsWith("clone:") || id.startsWith("library:");
/** A voice this workspace may use: a stock voice, a library voice or one of its live clones. */
export const isKnownVoice = async (workspaceId: string, id: string) => isStockVoice(id) || (await isLibraryVoice(id)) || !!(await liveClone(workspaceId, id));
/** Where an OpenAI voice's sample lives (made once by scripts/render-voice-samples.ts). */
export const voiceSampleKey = (id: string) => `system/voices/${id}.wav`;
export const SAMPLE_LINE = "Bonjour ! Voici à quoi ressemble ma voix dans vos vidéos.";

// Plans made before reels had a language were all French.
const instructions = (language = "fr") => `Speak in ${languageName(language)}, with a calm, warm tone and a measured pace.`;

/** deadline (epoch ms): stop waiting out a busy provider past it, so a render's voice step fits its job's time. */
export async function speak(input: { text: string; voice: string; language?: string; deadline?: number; workspaceId?: string }): Promise<Uint8Array> {
  if (input.voice.startsWith("clone:")) {
    // Checked here too: a clone archived after the render was charged is never spoken.
    const clone = input.workspaceId ? await liveClone(input.workspaceId, input.voice) : null;
    if (!clone?.providerVoiceId) throw new Error(`Unknown voice ${input.voice}: pick another.`);
    return elevenSpeak(input.text, clone.providerVoiceId, input.deadline);
  }
  if (await isLibraryVoice(input.voice)) return elevenSpeak(input.text, input.voice.slice("library:".length), input.deadline);
  if (!isStockVoice(input.voice)) throw new Error(`Unknown voice ${input.voice}: pick another.`);
  return isElevenVoice(input.voice) ? elevenSpeak(input.text, input.voice.slice("eleven:".length), input.deadline) : openaiSpeak(input.text, input.voice, input.language);
}

/** Errors a retry can't fix: a voice we don't have, or our provider account refusing (key, plan, quota). */
export const voiceRefused = (e: unknown) => e instanceof Error && /^(Unknown voice |Recording missing|ElevenLabs (400|401|402|403|404|422)\b|Voiceover failed \((401|402|403)\))/.test(e.message);

async function openaiSpeak(text: string, voice: string, language?: string) {
  if (!process.env.OPENAI_API_KEY) throw new Error("Voiceover isn't set up on this server (OPENAI_API_KEY is missing).");
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice, response_format: "wav", input: text, instructions: instructions(language) }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Voiceover failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}

const BACKOFF_MS = [2_000, 5_000, 12_000];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * ElevenLabs: raw 24 kHz PCM wrapped as WAV. Busy (429) → wait and try again a few times (Retry-After when given).
 * The caller speaks a render's scenes one after another: the shared account allows few requests at once, and a
 * per-process limit wouldn't hold across server instances.
 */
async function elevenSpeak(text: string, voiceId: string, deadline = Infinity) {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("Voiceover isn't set up on this server (ELEVENLABS_API_KEY is missing).");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=pcm_24000`, {
      method: "POST",
      headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2" }),
      signal: AbortSignal.timeout(60_000),
    });
    if (res.ok) return pcmWav(new Uint8Array(await res.arrayBuffer()));
    const wait = Math.min(30_000, Number(res.headers.get("retry-after")) * 1000 || BACKOFF_MS[attempt]);
    if (res.status === 429 && attempt < BACKOFF_MS.length && Date.now() + wait < deadline) {
      await sleep(wait);
      continue;
    }
    // "ElevenLabs 401/402/403…" and quota errors read as "unavailable" in render.ts renderFailure.
    throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
}

const sampleUrl = async (v: StockVoice) => v.previewUrl ?? ((await mediaKnown(voiceSampleKey(v.id))) ? signedMediaUrl(voiceSampleKey(v.id)) : null);

/**
 * R11's Voices screen: every voice a reel may use, with a sample to listen to (never generated here). The
 * workspace's clones come first; `mine` marks the ones the person owns.
 */
export async function voiceList(workspaceId: string, userId: string) {
  const clones = await liveClones(workspaceId);
  const stock = await Promise.all(STOCK_VOICES.map(async (v) => ({ id: v.id, name: v.name, gender: v.gender as StockVoice["gender"] | "clone", sampleUrl: await sampleUrl(v), clone: false, mine: false })));
  const own = await Promise.all(
    clones.map(async (c) => ({ id: `clone:${c.id}`, name: c.name, gender: "clone" as const, sampleUrl: c.sampleKey ? await signedMediaUrl(c.sampleKey) : null, clone: true, mine: c.ownerUserId === userId })),
  );
  return [...own, ...stock];
}
