import { problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { kickRunner } from "@/server/jobs/runner";
import { createPresenter, PresenterRequest } from "@/server/reels/presenters";
import { toReelProblem as toProblem } from "@/server/reels/service";
import { InsufficientCreditsError } from "@/server/services/credits";
import { PlanRequiredError } from "@/server/services/subscriptions";

type Params = { params: Promise<BrandRouteParams> };

/** R10 "Create presenter": a character sheet from a name and a few traits (paid). */
export async function POST(request: Request, context: Params) {
  try {
    const parsed = PresenterRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400, detail: parsed.error.issues[0]?.message });
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    try {
      const asset = await createPresenter(scope, parsed.data);
      kickRunner();
      return Response.json({ id: asset.id }, { status: 202 });
    } catch (e) {
      if (e instanceof InsufficientCreditsError) return Response.json({ insufficientCredits: true, balance: e.balance, needed: e.needed }, { status: 402 });
      if (e instanceof PlanRequiredError) return Response.json({ planRequired: true, title: e.message }, { status: 402 });
      throw e;
    }
  } catch (error) {
    return toProblem(error);
  }
}
