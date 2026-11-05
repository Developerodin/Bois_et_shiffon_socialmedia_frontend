import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { SHOPIFY_SCOPES, shopDomain, shopifyQuery } from "@/server/catalog/shopify";
import { enqueueCatalogSync } from "@/server/catalog/sync";
import { kickRunner } from "@/server/jobs/runner";
import { ReconnectNeeded, saveConnections, toConnectionDto } from "@/server/services/connections";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

const Body = z.object({ shop: z.string().max(200), accessToken: z.string().trim().min(10).max(200) });

const invalid = (detail: string) => problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Couldn't connect Shopify", status: 422, detail });
const MISSING_SCOPES = "This token doesn't have the read_products and read_inventory scopes. Add both to the app in Shopify, reinstall it and paste the new token.";

/**
 * Connect a Shopify store with a custom app's Admin API token: verify it and its scopes against the shop, store it
 * encrypted, queue a catalogue sync. The token is never returned or logged; Shopify's errors stay in the server log.
 */
export async function POST(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "integrations.manage");
    if (scope instanceof Response) return scope;
    const body = Body.safeParse(await request.json().catch(() => null));
    const shop = body.success ? shopDomain(body.data.shop) : null;
    if (!body.success || !shop) return invalid("Enter your store's .myshopify.com address and its Admin API access token.");
    const { accessToken } = body.data;

    let name: string;
    try {
      const { data } = await shopifyQuery<{ shop: { name: string }; currentAppInstallation: { accessScopes: { handle: string }[] } }>(
        shop,
        accessToken,
        "{ shop { name } currentAppInstallation { accessScopes { handle } } }",
      );
      // A write_ scope includes its read_ scope.
      const granted = new Set(data.currentAppInstallation.accessScopes.map((s) => s.handle.replace(/^write_/, "read_")));
      if (!SHOPIFY_SCOPES.every((s) => granted.has(s))) return invalid(MISSING_SCOPES);
      name = data.shop.name.slice(0, 200);
    } catch (e) {
      console.warn("[shopify] connect check failed", shop, e instanceof Error ? e.message : e);
      return e instanceof ReconnectNeeded
        ? invalid("Shopify refused this token. Check that the app is installed and has the read_products and read_inventory scopes.")
        : problemResponse({ type: "https://api.brandpilot/errors/upstream", title: "Couldn't reach Shopify", status: 502, detail: `Couldn't reach ${shop}. Check the address and try again.` });
    }

    const [conn] = await saveConnections({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      provider: "SHOPIFY",
      userId: scope.userId,
      // The shop is the account id; the sync reads it from there.
      accounts: [{ externalAccountId: shop, displayName: name, credentials: { accessToken }, tokenExpiresAt: null, scopes: SHOPIFY_SCOPES }],
    });
    await enqueueCatalogSync(scope, `connect:${conn.updatedAt.toISOString()}`);
    kickRunner();
    return Response.json({ connection: toConnectionDto(conn) }, { status: 201 });
  } catch (error) {
    return fromAccessError(error);
  }
}
