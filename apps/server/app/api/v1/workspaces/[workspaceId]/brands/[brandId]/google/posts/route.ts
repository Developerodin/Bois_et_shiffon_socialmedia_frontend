import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { invalidBody } from "@/server/api/ai-model-route";
import { toCustomersProblem } from "@/server/customers/problem";
import { createPost, PostRequest } from "@/server/google/business";

type Params = { params: Promise<BrandRouteParams> };

/** "Publish post": the person's own tap puts the update on the Business Profile. */
export async function POST(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "publish.execute");
    if (scope instanceof Response) return scope;
    const parsed = PostRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidBody(parsed.error);
    const body = parsed.data;
    await createPost(scope, body);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toCustomersProblem(error);
  }
}
