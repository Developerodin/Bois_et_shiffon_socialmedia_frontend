import { z } from "zod";
import { problemResponse } from "@/server/api/http-error";
import { AccessDeniedError } from "@/server/auth/errors";
import { requestUserId } from "@/server/auth/request-user";
import { PROVIDERS, PROVIDER_SLUGS, ProviderError } from "@/server/integrations/providers";
import { completeConnect, ConnectionError } from "@/server/services/connections";

const Body = z.object({ state: z.string().min(1).max(200), code: z.string().min(1).max(2000) }).strict();

const fail = (status: number, detail: string) =>
  problemResponse({ type: "https://api.brandpilot/errors/connect", title: "Couldn't connect", status, detail });

/**
 * The app finishes a connect it started (the callback handed it state + code). The connect only goes through when
 * the signed-in caller is the person who started it: completeConnect consumes the state for that user only.
 */
export async function POST(request: Request, context: { params: Promise<{ provider: string }> }) {
  const provider = PROVIDER_SLUGS[(await context.params).provider];
  if (!provider) return fail(404, "Unknown provider");
  const userId = await requestUserId(request);
  if (!userId) return fail(401, "Sign in again to connect");
  const body = Body.safeParse(await request.json().catch(() => null));
  if (!body.success) return fail(422, "Invalid request");
  try {
    const { connections } = await completeConnect({ provider, ...body.data, userId });
    return Response.json({ connected: connections.map((c) => c.displayName) });
  } catch (error) {
    if (error instanceof ConnectionError) return fail(409, error.message);
    if (error instanceof AccessDeniedError) return fail(403, "You don't have permission to connect accounts for this brand");
    if (error instanceof ProviderError) {
      // "<status> <provider text>" is for logs, not people (same as the web callback).
      console.error(`[integrations] ${provider} connect failed:`, error.message);
      return fail(502, /^\d{3} /.test(error.message) ? `Couldn't connect ${PROVIDERS[provider].label}. Try again.` : error.message);
    }
    console.error("[integrations] mobile complete failed", error);
    return fail(500, "Something went wrong while connecting. Try again.");
  }
}
