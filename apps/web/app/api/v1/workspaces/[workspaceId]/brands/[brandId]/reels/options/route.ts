import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { kickIfDue } from "@/server/jobs/runner";
import { toReelProblem as toProblem } from "@/server/reels/service";
import { templateOptions } from "@/server/reels/templates";

type Params = { params: Promise<BrandRouteParams> };

/** R12: the templates with their previews (polled by the phone while a brand preview is being made). */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    await kickIfDue().catch(() => {});
    return Response.json(await templateOptions(scope));
  } catch (error) {
    return toProblem(error);
  }
}
