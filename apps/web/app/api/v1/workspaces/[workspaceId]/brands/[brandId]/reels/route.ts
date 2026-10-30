import { z } from "zod";
import { problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { createReel, listReels, toReelProblem as toProblem } from "@/server/reels/service";

// Writing and directing a new plan is two AI calls.
export const maxDuration = 120;

type Params = { params: Promise<BrandRouteParams> };

/** R06: this brand's studio reels. */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    return Response.json({ reels: await listReels(scope) });
  } catch (error) {
    return toProblem(error);
  }
}

const Create = z.object({ opportunityId: z.string().min(1).max(100).optional(), prompt: z.string().min(1).max(2000).optional() }).refine((b) => b.opportunityId || b.prompt, "Pick an idea or say what the reel is about");

/** R02 (from an idea) or R04 (from the person's words): a new reel with its first plan. */
export async function POST(request: Request, context: Params) {
  try {
    const parsed = Create.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400, detail: parsed.error.issues[0]?.message });
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    return Response.json(await createReel(scope, parsed.data), { status: 201 });
  } catch (error) {
    return toProblem(error);
  }
}
