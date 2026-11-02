/**
 * Reel voiceover: OpenAI text-to-speech, one WAV per scene (Higgsfield's API has no voice models).
 * WAV so the length can be read without a decoder (wav.ts) and scenes can be padded and joined as raw PCM.
 */
export const REEL_VOICES = ["coral", "sage", "ash", "ballad", "verse"] as const;
export type ReelVoice = (typeof REEL_VOICES)[number];

import { languageName } from "@/server/reels/plan";

// Plans made before reels had a language were all French.
const instructions = (language = "fr") => `Speak in ${languageName(language)}, with a calm, warm tone and a measured pace.`;

export async function speak(input: { text: string; voice: string; language?: string }): Promise<Uint8Array> {
  if (!process.env.OPENAI_API_KEY) throw new Error("Voiceover isn't set up on this server (OPENAI_API_KEY is missing).");
  const voice = (REEL_VOICES as readonly string[]).includes(input.voice) ? input.voice : REEL_VOICES[0];
  const res = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "gpt-4o-mini-tts", voice, response_format: "wav", input: input.text, instructions: instructions(input.language) }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Voiceover failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return new Uint8Array(await res.arrayBuffer());
}
