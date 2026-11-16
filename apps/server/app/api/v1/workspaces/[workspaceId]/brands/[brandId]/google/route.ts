import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { toCustomersProblem } from "@/server/customers/problem";
import { businessPosts, businessProfile } from "@/server/google/business";

type Params = { params: Promise<BrandRouteParams> };

/** G13/G14 Google Growth: the connected Business Profile and its latest posts ({ connected: false } before connecting). */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const profile = await businessProfile(scope);
    return Response.json({ profile, posts: profile.connected ? await businessPosts(scope) : [] });
  } catch (error) {
    return toCustomersProblem(error);
  }
}
