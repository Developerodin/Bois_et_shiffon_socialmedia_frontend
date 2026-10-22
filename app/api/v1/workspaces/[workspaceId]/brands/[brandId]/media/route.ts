import { randomUUID } from "node:crypto";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { mediaKey, putMedia, signedMediaUrl } from "@/server/storage/media";

// Vercel caps request bodies at 4.5 MB; videos stay as links.
const MAX_BYTES = 4 * 1024 * 1024;

/** Detect the type from the file's first bytes, not its name or the browser's claim. */
function imageType(b: Uint8Array) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  return null;
}

const invalid = (title: string, status = 400) => problemResponse({ type: "https://api.brandpilot/errors/media", title, status, detail: title });

/**
 * Upload one image to the brand's private media storage. Returns its key (passed as `mediaKeys`
 * when publishing) and a one-hour preview link.
 * ponytail: files nobody publishes stay in the bucket; add a bucket lifecycle rule if storage grows.
 */
export async function POST(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "publish.execute");
    if (scope instanceof Response) return scope;
    if (Number(request.headers.get("content-length") ?? 0) > MAX_BYTES + 64 * 1024) return invalid("Images can be up to 4 MB", 413);

    const file = (await request.formData().catch(() => null))?.get("file");
    if (!(file instanceof File)) return invalid("Choose an image to upload");
    if (file.size > MAX_BYTES) return invalid("Images can be up to 4 MB", 413);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = imageType(bytes);
    if (!kind) return invalid("Upload a JPG or PNG image");

    const key = mediaKey(scope, `${randomUUID()}.${kind.ext}`);
    await putMedia(key, bytes, kind.type);
    return Response.json({ key, previewUrl: await signedMediaUrl(key) }, { status: 201 });
  } catch (error) {
    return fromAccessError(error);
  }
}
