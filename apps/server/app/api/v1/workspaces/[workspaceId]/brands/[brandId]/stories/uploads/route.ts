import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { PublishingError } from "@/server/services/publishing";
import { createUploadSlot } from "@/server/stories/uploads";

/** Ask for a place to upload one story photo or clip (the phone then PUTs the file there and calls the done route). */
export async function POST(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    const b = ((await request.json().catch(() => null)) ?? {}) as Record<string, unknown>;
    const slot = await createUploadSlot(scope, {
      kind: b.kind as "photo" | "video",
      contentType: String(b.contentType ?? ""),
      bytes: Number(b.bytes),
      rightsConfirmed: b.rightsConfirmed as true, // checked inside: anything but true is refused
    });
    return Response.json(slot, { status: 201 });
  } catch (error) {
    if (error instanceof PublishingError) return problemResponse({ type: "https://api.brandpilot/errors/publishing", title: error.message, status: error.status, detail: error.message, code: error.code });
    return fromAccessError(error);
  }
}
