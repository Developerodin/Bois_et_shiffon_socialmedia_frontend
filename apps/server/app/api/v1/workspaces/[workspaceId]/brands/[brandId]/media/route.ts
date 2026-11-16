import { randomUUID } from "node:crypto";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { prisma } from "@/server/db/prisma";
import { imageType, mediaKey, putMedia, signedMediaUrl } from "@/server/storage/media";

// ponytail: a cap so the JSON list stays small; a table if brands need bigger libraries.
const LIBRARY_MAX = 60;

// Vercel caps request bodies at 4.5 MB; videos stay as links.
const MAX_BYTES = 4 * 1024 * 1024;

const invalid = (title: string, status = 400) => problemResponse({ type: "https://api.brandpilot/errors/media", title, status, detail: title });

/**
 * Upload one image to the brand's private media storage. Returns its key (passed as `mediaKeys`
 * when publishing) and a one-hour preview link. With `library=1` (Business M08) it's also added to the brand's
 * photo library (BrandProfile.uploads, titled `title`), where the writers and reels find it.
 * ponytail: files nobody publishes stay in the bucket; add a bucket lifecycle rule if storage grows.
 */
export async function POST(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "publish.execute");
    if (scope instanceof Response) return scope;
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return invalid("Images can be up to 4 MB", 413);

    const form = (await request.formData().catch(() => null)) ?? new FormData();
    const file = form.get("file");
    if (!(file instanceof File)) return invalid("Choose an image to upload");
    if (file.size > MAX_BYTES) return invalid("Images can be up to 4 MB", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = imageType(bytes);
    if (!kind) return invalid("Upload a JPG or PNG image");

    const library = form.get("library") === "1";
    if (library) {
      const profile = await prisma.brandProfile.findFirst({ where: { brandId: scope.brandId, workspaceId: scope.workspaceId }, select: { uploads: true } });
      if (!profile) return invalid("This business has no profile yet", 409);
      if (Array.isArray(profile.uploads) && profile.uploads.length >= LIBRARY_MAX) return invalid(`Up to ${LIBRARY_MAX} photos. Remove some first.`, 409);
    }

    const key = mediaKey(scope, `${randomUUID()}.${kind.ext}`);
    await putMedia(key, bytes, kind.type);
    if (library) {
      const title = String(form.get("title") ?? "").replace(/\s+/g, " ").trim().slice(0, 120) || "Photo";
      const entry = JSON.stringify([{ key, title, addedAt: new Date().toISOString() }]);
      // One statement: two uploads at once both land.
      await prisma.$executeRaw`
        UPDATE "BrandProfile" SET "updatedAt" = now(), "uploads" = COALESCE("uploads", '[]'::jsonb) || ${entry}::jsonb
        WHERE "brandId" = ${scope.brandId} AND "workspaceId" = ${scope.workspaceId}`;
    }
    return Response.json({ key, previewUrl: await signedMediaUrl(key) }, { status: 201 });
  } catch (error) {
    return fromAccessError(error);
  }
}
