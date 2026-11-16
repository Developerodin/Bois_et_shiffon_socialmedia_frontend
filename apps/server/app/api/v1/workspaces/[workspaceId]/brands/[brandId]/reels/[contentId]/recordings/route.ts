import { problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { MAX_RECORDING_BYTES, uploadRecording } from "@/server/reels/recordings";
import { toReelProblem as toProblem } from "@/server/reels/service";

// Converting and transcribing one take: a few seconds.
export const maxDuration = 60;

type Params = { params: Promise<BrandRouteParams & { contentId: string }> };
const invalid = (title: string, status = 400) => problemResponse({ type: "https://api.brandpilot/errors/reels", title, status, detail: title });

/** R11 "Record voiceover": one take (M4A) for one scene's text; returns what was heard and whether it's that text. */
export async function POST(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    const { contentId } = await context.params;
    // Only an id-shaped value gets a rate-limit row of its own (the reel itself is checked after).
    if (!/^[a-z0-9]{10,40}$/.test(contentId)) return invalid("Reel not found", 404);
    if (Number(request.headers.get("content-length") ?? 0) > MAX_RECORDING_BYTES + 64 * 1024) return invalid("Keep it under 15 seconds.", 413);
    const form = (await request.formData().catch(() => null)) ?? new FormData();
    const file = form.get("file");
    const text = String(form.get("text") ?? "").trim().slice(0, 400);
    if (!(file instanceof File) || !text) return invalid("Record the scene, then send it.");
    if (file.size > MAX_RECORDING_BYTES) return invalid("Keep it under 15 seconds.", 413);
    const language = String(form.get("language") ?? "").match(/^[a-zA-Z]{2,3}(-[a-zA-Z0-9]{2,8})?$/)?.[0];
    // Each take costs a conversion and a speech-to-text call: 30 an hour per person, 60 per reel.
    const [mine, reel] = await Promise.all([hitRateLimit(`rec:user:${scope.userId}`, 30, 3600_000), hitRateLimit(`rec:reel:${contentId}`, 60, 3600_000)]);
    if (!mine.allowed || !reel.allowed) return invalid("Too many recordings for now. Try again in a while.", 429);
    return Response.json(await uploadRecording(scope, contentId, { bytes: new Uint8Array(await file.arrayBuffer()), text, language }), { status: 201 });
  } catch (error) {
    return toProblem(error);
  }
}
