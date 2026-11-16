/**
 * Delete after the owner decides. Option A vs B for presenter scenes (both spend our Higgsfield credits):
 *   A: our voice track (OpenAI speech), lip-synced by Seedance 2.5 reference-to-video (what render.ts does).
 *   B: Higgsfield's native audio (Seedance 2.5 image-to-video speaking the line itself, generate_audio on).
 * Prints both finished clip links to compare by eye and ear. B is not wired into the render.
 *   npx tsx --conditions=react-server --env-file=.env scripts/compare-presenter-audio.ts <workspaceId> <brandId> <presenterId> "<line>"
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";
import { higgsfield } from "@/server/reels/higgsfield";
import { donePresenter } from "@/server/reels/presenters";
import { speak } from "@/server/reels/voice";
import { mediaKey, putMedia, signedMediaUrl } from "@/server/storage/media";

async function finished(requestId: string) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 15_000));
    const s = await higgsfield.status(requestId);
    if (s.state === "completed") return s.url!;
    if (s.state === "failed") return `failed: ${s.error}`;
  }
}

async function main() {
  const [workspaceId, brandId, presenterId, line] = process.argv.slice(2);
  if (!line) throw new Error('Usage: npx tsx --conditions=react-server --env-file=.env scripts/compare-presenter-audio.ts <workspaceId> <brandId> <presenterId> "<line>"');
  const scope = { workspaceId, brandId };
  const presenter = await donePresenter(scope, presenterId);
  if (!presenter?.outputKey) throw new Error("No finished presenter with that id in this brand");
  const sheetUrl = await signedMediaUrl(presenter.outputKey, 24 * 3600);
  const voiceKey = mediaKey(scope, `compare-${randomUUID()}.wav`);
  await putMedia(voiceKey, await speak({ text: line, voice: "coral", language: "fr" }), "audio/wav");
  const run = randomUUID();
  const [a, b] = await Promise.all([
    higgsfield.animate({ model: "seedance-2.5-ref", photoUrl: sheetUrl, imageUrls: [sheetUrl], audioUrl: await signedMediaUrl(voiceKey, 24 * 3600), prompt: "The person in image 1 speaks to camera, warm and natural, lips in sync with the audio. Vertical 9:16.", seconds: 5, idempotencyKey: `compare:${run}:a` }),
    higgsfield.image("/bytedance/seedance-2.5/image-to-video", { image_url: sheetUrl, prompt: `The person speaks to camera, warm and natural, saying: "${line}". Vertical 9:16.`, duration: 5, resolution: "1080p", generate_audio: true }, `compare:${run}:b`),
  ]);
  const [urlA, urlB] = await Promise.all([finished(a), finished(b)]);
  console.log(`A (our voice, lip-synced): ${urlA}\nB (Higgsfield native audio): ${urlB}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
