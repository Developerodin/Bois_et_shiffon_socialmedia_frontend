import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { PublishingError } from "@/server/services/publishing";
import { listStorySources } from "@/server/stories/sources";

/** The photos and clips a story frame can use: the chosen products' photos, and the brand's library. */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    const productIds = (new URL(request.url).searchParams.get("productIds") ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 20);
    return Response.json({ tabs: await listStorySources(scope, { productIds }) });
  } catch (error) {
    if (error instanceof PublishingError) return problemResponse({ type: "https://api.brandpilot/errors/publishing", title: error.message, status: error.status, detail: error.message, code: error.code });
    return fromAccessError(error);
  }
}
