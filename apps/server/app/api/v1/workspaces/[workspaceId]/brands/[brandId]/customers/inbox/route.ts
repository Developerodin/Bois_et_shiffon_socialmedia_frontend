import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { inbox } from "@/server/customers/inbox";
import { toCustomersProblem } from "@/server/customers/problem";

type Params = { params: Promise<BrandRouteParams> };

/** M02 Inbox: messaging accounts and their latest Instagram / Messenger conversations. */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    return Response.json(await inbox(scope));
  } catch (error) {
    return toCustomersProblem(error);
  }
}
