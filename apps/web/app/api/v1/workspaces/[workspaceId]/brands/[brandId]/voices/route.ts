import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { toReelProblem as toProblem } from "@/server/reels/service";
import { canManageVoices, CLONE_CREDITS, CLONE_SECONDS, CONSENT_TEXT, MAX_CLONES } from "@/server/reels/clones";
import { voiceList } from "@/server/reels/voice";

type Params = { params: Promise<BrandRouteParams> };

/** R11 Voices: the voices a reel may use (the workspace's clones, then stock), and what cloning needs. */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const [voices, canClone] = await Promise.all([voiceList(scope.workspaceId, scope.userId), canManageVoices(scope.workspaceId, scope.userId)]);
    return Response.json({ voices, cloning: { allowed: canClone, credits: CLONE_CREDITS, max: MAX_CLONES, seconds: CLONE_SECONDS, consent: CONSENT_TEXT } });
  } catch (error) {
    return toProblem(error);
  }
}
