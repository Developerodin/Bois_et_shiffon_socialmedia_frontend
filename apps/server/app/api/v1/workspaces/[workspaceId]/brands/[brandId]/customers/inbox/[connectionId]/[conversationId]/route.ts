import { invalidBody } from "@/server/api/ai-model-route";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { SendRequest, sendReply, thread } from "@/server/customers/inbox";
import { toCustomersProblem } from "@/server/customers/problem";

type Params = { params: Promise<BrandRouteParams & { connectionId: string; conversationId: string }> };

/** M03 Reply: one conversation's latest messages. */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const { connectionId, conversationId } = await context.params;
    return Response.json(await thread(scope, connectionId, conversationId));
  } catch (error) {
    return toCustomersProblem(error);
  }
}

/** M03 "Send": the person's own tap sends their reply. */
export async function POST(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "publish.execute");
    if (scope instanceof Response) return scope;
    const parsed = SendRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidBody(parsed.error);
    const { connectionId, conversationId } = await context.params;
    await sendReply(scope, connectionId, conversationId, parsed.data.text);
    return new Response(null, { status: 204 });
  } catch (error) {
    return toCustomersProblem(error);
  }
}
