import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { toCustomersProblem } from "@/server/customers/problem";
import { businessReviews } from "@/server/google/business";

type Params = { params: Promise<BrandRouteParams> };

/** M04 Reviews: the profile's Google reviews, newest first. */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    return Response.json(await businessReviews(scope));
  } catch (error) {
    return toCustomersProblem(error);
  }
}
