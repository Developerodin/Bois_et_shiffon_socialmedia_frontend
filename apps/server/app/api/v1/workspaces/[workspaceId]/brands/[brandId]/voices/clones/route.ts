import { problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { createClone, MAX_CLONE_BYTES } from "@/server/reels/clones";
import { toReelProblem as toProblem } from "@/server/reels/service";
import { InsufficientCreditsError } from "@/server/services/credits";
import { PlanRequiredError } from "@/server/services/subscriptions";

// Converting, checking the plan and cloning at ElevenLabs: up to ~40 s.
export const maxDuration = 60;

type Params = { params: Promise<BrandRouteParams> };
const invalid = (title: string, status = 400) => problemResponse({ type: "https://api.brandpilot/errors/voices", title, status, detail: title });

/** Voices → Clone a voice: a 60–90 s reading (M4A), a name and the consent tick. Workspace admins only (voices.manage). */
export async function POST(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "voices.manage");
    if (scope instanceof Response) return scope;
    if (Number(request.headers.get("content-length") ?? 0) > MAX_CLONE_BYTES + 64 * 1024) return invalid("That recording is too large.", 413);
    if (!(await hitRateLimit(`clone:user:${scope.userId}`, 5, 3600_000)).allowed) return invalid("Too many tries for now. Try again in a while.", 429);
    const form = (await request.formData().catch(() => null)) ?? new FormData();
    const file = form.get("file");
    const name = String(form.get("name") ?? "").replace(/\s+/g, " ").trim().slice(0, 40);
    if (!(file instanceof File) || !name) return invalid("Give the voice a name and record the passage.");
    if (file.size > MAX_CLONE_BYTES) return invalid("That recording is too large.", 413);
    try {
      const voice = await createClone(scope, { name, bytes: new Uint8Array(await file.arrayBuffer()), consent: form.get("consent") === "1", appVersion: String(form.get("appVersion") ?? "").slice(0, 40) || undefined });
      return Response.json({ id: `clone:${voice.id}`, name: voice.name }, { status: 201 });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) return Response.json({ insufficientCredits: true, balance: e.balance, needed: e.needed }, { status: 402 });
      if (e instanceof PlanRequiredError) return Response.json({ planRequired: true, title: e.message }, { status: 402 });
      throw e;
    }
  } catch (error) {
    return toProblem(error);
  }
}
