import { z } from "zod";
import { problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { chatPlan, toReelProblem as toProblem } from "@/server/reels/service";

// The scriptwriter and the director: two AI calls.
export const maxDuration = 120;

type Params = { params: Promise<BrandRouteParams & { contentId: string }> };

/** R04: the person's message revises the plan (also how a redo is asked for after seeing the video). */
export async function POST(request: Request, context: Params) {
  try {
    const parsed = z.object({ version: z.number().int().min(0), message: z.string().trim().min(1).max(2000) }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400, detail: parsed.error.issues[0]?.message });
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    const { contentId } = await context.params;
    return Response.json(await chatPlan(scope, contentId, parsed.data));
  } catch (error) {
    return toProblem(error);
  }
}
