import { problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { kickIfDue, kickRunner } from "@/server/jobs/runner";
import { createShoot, listShoots, shootView, ShootRequest } from "@/server/photoshoot/shoot";
import { InsufficientCreditsError } from "@/server/services/credits";
import { PlanRequiredError } from "@/server/services/subscriptions";
import { toReelProblem as toProblem } from "@/server/reels/service";

// The shoot runs after the answer (kickRunner): an OpenAI Ultra shoot takes a few minutes.
export const maxDuration = 300;

type Params = { params: Promise<BrandRouteParams> };

/** F06: this brand's photoshoots, newest first. */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    await kickIfDue().catch(() => {});
    return Response.json({ shoots: await listShoots(scope) });
  } catch (error) {
    return toProblem(error);
  }
}

/** F02/F03 "Generate": a new shoot on the picked tier. */
export async function POST(request: Request, context: Params) {
  try {
    const parsed = ShootRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400, detail: parsed.error.issues[0]?.message });
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    try {
      const shoot = await createShoot(scope, parsed.data);
      kickRunner();
      return Response.json({ shoot: await shootView(shoot) }, { status: 202 });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) return Response.json({ insufficientCredits: true, balance: e.balance, needed: e.needed }, { status: 402 });
      if (e instanceof PlanRequiredError) return Response.json({ planRequired: true, title: e.message }, { status: 402 });
      throw e;
    }
  } catch (error) {
    return toProblem(error);
  }
}
