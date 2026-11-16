/**
 * Live check against the linked Neon branch: Postgres round-trip + Object
 * Storage put → presigned GET → delete. Run: npm run smoke:neon -w web
 */
import { prisma } from "@/server/db/prisma";
import {
  deleteMedia,
  mediaKey,
  putMedia,
  signedMediaUrl,
} from "@/server/storage/media";

async function main() {
  const [{ now }] = await prisma.$queryRaw<{ now: Date }[]>`select now()`;
  const brands = await prisma.brand.count();
  console.log("postgres ok:", { now, brands });

  const key = mediaKey(
    { workspaceId: "smoke", brandId: "smoke" },
    `check-${Date.now()}.txt`,
  );
  const body = `neon smoke ${new Date().toISOString()}`;
  await putMedia(key, body, "text/plain");
  const res = await fetch(await signedMediaUrl(key, 60));
  const text = await res.text();
  if (!res.ok || text !== body) {
    throw new Error(`presigned GET mismatch: ${res.status} ${text}`);
  }
  await deleteMedia(key);
  const gone = await fetch(await signedMediaUrl(key, 60));
  if (gone.ok) throw new Error("object still readable after delete");
  console.log("storage ok:", { key, getStatus: res.status, afterDelete: gone.status });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
