import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { removePresenter } from "@/server/reels/presenters";
import { toReelProblem as toProblem } from "@/server/reels/service";

type Params = { params: Promise<BrandRouteParams & { presenterId: string }> };

/** R10: remove a presenter. Reels planned with it are refused at render until another is picked. */
export async function DELETE(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    await removePresenter(scope, (await context.params).presenterId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toProblem(error);
  }
}
