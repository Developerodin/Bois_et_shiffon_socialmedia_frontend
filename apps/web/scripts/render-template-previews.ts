/**
 * The generic template previews everyone sees on R12 until their brand pays for its own: one 5 s clip per template,
 * made from a demo brand's photos. Every customer sees the result, so use only a brand whose photos we may show to
 * all (our own demo brand). Spends our Higgsfield credits (customers aren't charged). Skips previews already
 * stored, and the Idempotency-Key `template:<id>:<version>` makes a rerun after a crash return the same job.
 *   npx tsx --conditions=react-server --env-file=.env scripts/render-template-previews.ts <workspaceId> <brandId>
 */
import { productPhotos } from "@/server/content/knowledge";
import { prisma } from "@/server/db/prisma";
import { higgsfield } from "@/server/reels/higgsfield";
import { frame } from "@/server/photoshoot/shoot";
import { genericPreviewKey, REEL_TEMPLATES, storePreview, submitPreview } from "@/server/reels/templates";
import { mediaExists, putMedia, signedMediaUrl } from "@/server/storage/media";

async function main() {
  const [workspaceId, brandId] = process.argv.slice(2);
  if (!workspaceId || !brandId) throw new Error("Usage: npx tsx --conditions=react-server --env-file=.env scripts/render-template-previews.ts <workspaceId> <brandId>");
  const photos = await productPhotos(workspaceId, brandId);
  if (!photos.length) throw new Error("That brand has no photos");
  for (const [i, t] of REEL_TEMPLATES.entries()) {
    const key = genericPreviewKey(t);
    if (await mediaExists(key)) {
      console.log(`${t.id}: already stored`);
      continue;
    }
    const sourceKey = key.replace(/\.mp4$/, "-source.jpg");
    const photo = await fetch(await signedMediaUrl(photos[i % photos.length].key));
    await putMedia(sourceKey, await frame(new Uint8Array(await photo.arrayBuffer()), "9:16"), "image/jpeg");
    const requestId = await submitPreview(t.motion, await signedMediaUrl(sourceKey, 24 * 3600), `template:${t.id}:${t.version}`);
    for (;;) {
      await new Promise((r) => setTimeout(r, 15_000));
      const s = await higgsfield.status(requestId);
      if (s.state === "failed") throw new Error(`${t.id}: ${s.error}`);
      if (s.state === "completed") {
        await storePreview(s.url!, key);
        console.log(`${t.id}: stored ${key}`);
        break;
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
