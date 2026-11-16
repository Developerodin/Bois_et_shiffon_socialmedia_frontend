import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { invalidBody } from "@/server/api/ai-model-route";
import { toCustomersProblem } from "@/server/customers/problem";
import { draftReply, DraftRequest } from "@/server/customers/drafts";

type Params = { params: Promise<BrandRouteParams> };

/** An AI suggestion for a review reply, a message reply or a Google post. It only returns text; nothing is sent. */
export async function POST(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    const parsed = DraftRequest.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalidBody(parsed.error);
    const body = parsed.data;
    return Response.json({ draft: await draftReply(scope, body) });
  } catch (error) {
    return toCustomersProblem(error);
  }
}
