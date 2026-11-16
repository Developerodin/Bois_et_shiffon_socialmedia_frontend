import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { ConnectionError, startConnect } from "@/server/services/connections";

const Body = z.object({
  provider: z.enum(["META", "INSTAGRAM", "THREADS", "GOOGLE", "GOOGLE_BUSINESS", "REDDIT", "PINTEREST"]),
  client: z.enum(["web", "mobile"]).optional(),
});

/** Returns the provider consent URL; the browser navigates there. The app passes `client: "mobile"`. */
export async function POST(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "integrations.manage");
    if (scope instanceof Response) return scope;
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 422 });
    }
    const url = await startConnect({ ...scope, provider: body.data.provider, client: body.data.client });
    return Response.json({ url });
  } catch (error) {
    if (error instanceof ConnectionError) {
      return problemResponse({ type: "https://api.brandpilot/errors/not-configured", title: "Not set up", status: 409, detail: error.message });
    }
    return fromAccessError(error);
  }
}
