import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { toReelProblem as toProblem } from "@/server/reels/service";
import { voiceList } from "@/server/reels/voice";

type Params = { params: Promise<BrandRouteParams> };

/** R11 Voices: the voices a reel may use (stock; the workspace's clones join them later). */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    return Response.json({ voices: await voiceList() });
  } catch (error) {
    return toProblem(error);
  }
}
