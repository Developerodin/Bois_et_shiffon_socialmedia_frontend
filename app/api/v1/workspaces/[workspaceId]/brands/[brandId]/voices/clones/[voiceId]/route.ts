import { z } from "zod";
import { problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { deleteClone, renameClone } from "@/server/reels/clones";
import { toReelProblem as toProblem } from "@/server/reels/service";

type Params = { params: Promise<BrandRouteParams & { voiceId: string }> };
// The app names a clone "clone:<id>"; the route takes either form.
const idOf = (v: string) => v.replace(/^clone:/, "");

/** Rename a cloned voice (its owner or a workspace admin). */
export async function PATCH(request: Request, context: Params) {
  try {
    const parsed = z.object({ name: z.string().trim().min(1).max(40) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400, detail: parsed.error.issues[0]?.message });
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    await renameClone(scope, idOf((await context.params).voiceId), parsed.data.name);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toProblem(error);
  }
}

/** Delete a cloned voice (its owner or a workspace admin); `?withdraw=1`: its owner withdraws consent. */
export async function DELETE(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    await deleteClone(scope, idOf((await context.params).voiceId), new URL(request.url).searchParams.get("withdraw") === "1");
    return new Response(null, { status: 204 });
  } catch (error) {
    return toProblem(error);
  }
}
