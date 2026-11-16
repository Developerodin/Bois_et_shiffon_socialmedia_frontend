import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { kickIfDue } from "@/server/jobs/runner";
import { toReelProblem as toProblem } from "@/server/reels/service";
import { listPresenters, PRESENTER_CREDITS, PRESENTER_TRAITS } from "@/server/reels/presenters";
import { templateOptions } from "@/server/reels/templates";

type Params = { params: Promise<BrandRouteParams> };

/** R12 and R10: the templates with their previews, and the brand's presenters with the traits to make one (polled while one is being made). */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    await kickIfDue().catch(() => {});
    const [templates, presenters] = await Promise.all([templateOptions(scope), listPresenters(scope)]);
    return Response.json({ ...templates, presenters, traits: PRESENTER_TRAITS, presenterCredits: PRESENTER_CREDITS });
  } catch (error) {
    return toProblem(error);
  }
}
