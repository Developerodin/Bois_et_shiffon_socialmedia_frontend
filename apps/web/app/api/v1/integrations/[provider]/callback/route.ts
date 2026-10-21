import { auth } from "@/auth";
import { AccessDeniedError } from "@/server/auth/errors";
import { appUrl } from "@/server/auth/tokens";
import { PROVIDER_SLUGS, ProviderError } from "@/server/integrations/providers";
import { completeConnect, ConnectionError } from "@/server/services/connections";

/** OAuth redirect target for every provider. Always lands the user back on Settings → Connections. */
export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const back = (params: Record<string, string>) =>
    Response.redirect(appUrl(`/settings?${new URLSearchParams({ tab: "connections", ...params })}`), 303);

  const provider = PROVIDER_SLUGS[(await context.params).provider];
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!provider) return back({ connectError: "Unknown provider" });
  if (url.searchParams.get("error") || !code || !state) {
    return back({ connectError: "Connection was cancelled or denied" });
  }

  const session = await auth();
  if (!session?.user?.id) return Response.redirect(appUrl("/login"), 303);

  try {
    const { connections } = await completeConnect({ provider, state, code, userId: session.user.id });
    return back({ connected: connections.map((c) => c.displayName).join(", ") });
  } catch (error) {
    if (error instanceof ConnectionError || error instanceof ProviderError) return back({ connectError: error.message });
    if (error instanceof AccessDeniedError) return back({ connectError: "You don't have permission to connect accounts for this brand" });
    console.error("[integrations] callback failed", error);
    return back({ connectError: "Something went wrong while connecting. Try again." });
  }
}
