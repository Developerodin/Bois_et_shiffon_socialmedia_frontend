import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { kickIfDue } from "@/server/jobs/runner";
import { getShoot } from "@/server/photoshoot/shoot";
import { toReelProblem as toProblem } from "@/server/reels/service";

type Params = { params: Promise<BrandRouteParams & { shootId: string }> };

/** F05 polls this; F07 shows it. */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    await kickIfDue().catch(() => {});
    return Response.json({ shoot: await getShoot(scope, (await context.params).shootId) });
  } catch (error) {
    return toProblem(error);
  }
}
