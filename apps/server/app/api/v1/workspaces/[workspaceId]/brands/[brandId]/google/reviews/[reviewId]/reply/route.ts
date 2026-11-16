import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { invalidBody } from "@/server/api/ai-model-route";
import { toCustomersProblem } from "@/server/customers/problem";
import { replyToReview, ReplyRequest } from "@/server/google/business";

type Params = { params: Promise<BrandRouteParams & { reviewId: string }> };

/** "Post reply": the person's own tap publishes their (edited) reply on Google. */
export async function PUT(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "publish.execute");
    if (scope instanceof Response) return scope;
    const parsed = ReplyRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidBody(parsed.error);
    const body = parsed.data;
    return Response.json({ reply: await replyToReview(scope, (await context.params).reviewId, body.comment) });
  } catch (error) {
    return toCustomersProblem(error);
  }
}
