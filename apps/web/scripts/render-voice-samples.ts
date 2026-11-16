/**
 * One sample per OpenAI stock voice for the Voices screen (ElevenLabs voices have their own preview links).
 * Skips samples already stored. Costs a few cents of OpenAI speech.
 *   npx tsx --conditions=react-server --env-file=.env scripts/render-voice-samples.ts
 */
import { mediaExists, putMedia } from "@/server/storage/media";
import { SAMPLE_LINE, speak, STOCK_VOICES, voiceSampleKey } from "@/server/reels/voice";

async function main() {
  for (const v of STOCK_VOICES.filter((x) => x.provider === "openai")) {
    const key = voiceSampleKey(v.id);
    if (await mediaExists(key)) {
      console.log(`${v.id}: already stored`);
      continue;
    }
    await putMedia(key, await speak({ text: SAMPLE_LINE, voice: v.id, language: "fr" }), "audio/wav");
    console.log(`${v.id}: stored ${key}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
