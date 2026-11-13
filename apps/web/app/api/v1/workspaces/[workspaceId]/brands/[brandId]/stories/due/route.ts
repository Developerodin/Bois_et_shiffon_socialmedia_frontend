import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { PublishingError } from "@/server/services/publishing";
import { dueByHand } from "@/server/stories/by-hand";

/** Stories waiting for a person to post them by hand. Checked on every request: only people who can publish see them. */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "publish.execute");
    if (scope instanceof Response) return scope;
    return Response.json({ items: await dueByHand(scope) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof PublishingError) return problemResponse({ type: "https://api.brandpilot/errors/publishing", title: error.message, status: error.status, detail: error.message, code: error.code });
    return fromAccessError(error);
  }
}
