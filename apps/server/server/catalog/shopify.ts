import { setTimeout as sleep } from "node:timers/promises";
import { ReconnectNeeded } from "@/server/services/connections";

/**
 * Shopify Admin GraphQL for the product catalogue: a custom-app Admin API access token, pasted by the owner
 * (scopes read_products + read_inventory). Not OAuth, so it has no adapter in integrations/providers.ts.
 * ponytail: written against the 2025-07 docs and not yet run against a live store (owner tests it later);
 * the query shape, cost and Money fields are the first things to check if the first live sync fails.
 */
export const SHOPIFY_API_VERSION = "2025-07";
export const SHOPIFY_SCOPES = ["read_products", "read_inventory"];
export const SHOPIFY_REFUSED = "Shopify refused the access token. Reconnect with a new token.";

const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

/** "My-Store", "my-store.myshopify.com" or "https://my-store.myshopify.com/" → "my-store.myshopify.com"; anything else → null. */
export function shopDomain(raw: string): string | null {
  let s = raw.trim().toLowerCase().replace(/^https:\/\//, "").replace(/\/$/, "");
  if (/^[a-z0-9][a-z0-9-]*$/.test(s)) s = `${s}.myshopify.com`;
  return s.length <= 100 && SHOP_DOMAIN.test(s) ? s : null;
}

type Cost = { requestedQueryCost: number; actualQueryCost: number | null; throttleStatus: { currentlyAvailable: number; restoreRate: number } };

/** How long until the cost bucket holds `requestedQueryCost` again (Shopify restores `restoreRate` points a second). */
export function throttleWaitMs(cost: Cost | undefined) {
  if (!cost) return 1000;
  const { currentlyAvailable, restoreRate } = cost.throttleStatus;
  return Math.min(60_000, Math.max(0, ((cost.requestedQueryCost - currentlyAvailable) / restoreRate) * 1000));
}

const THROTTLE_RETRIES = 5;

/**
 * One Admin GraphQL call. The shop is re-validated here so the token can only ever go to *.myshopify.com, and
 * redirects are refused: fetch keeps custom headers (the token) on a cross-origin redirect.
 * A refused token (401/403, ACCESS_DENIED) throws ReconnectNeeded; THROTTLED waits for the bucket and retries.
 * Error text carries the status and Shopify's error codes only, never the token or the request.
 */
export async function shopifyQuery<T>(
  shop: string,
  accessToken: string,
  query: string,
  variables: Record<string, unknown> = {},
  signal?: AbortSignal,
): Promise<{ data: T; cost: Cost | undefined }> {
  if (!SHOP_DOMAIN.test(shop)) throw new Error("Invalid Shopify shop domain");
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://${shop}/admin/api/${SHOPIFY_API_VERSION}/graphql.json`, {
      method: "POST",
      redirect: "error",
      headers: { "content-type": "application/json", accept: "application/json", "x-shopify-access-token": accessToken },
      body: JSON.stringify({ query, variables }),
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(30_000)]) : AbortSignal.timeout(30_000),
    });
    if (res.status === 401 || res.status === 403) throw new ReconnectNeeded(`Shopify ${res.status}`);
    const body = (await res.json().catch(() => null)) as {
      data?: T;
      errors?: { message?: string; extensions?: { code?: string } }[];
      extensions?: { cost?: Cost };
    } | null;
    const codes = body?.errors?.map((e) => e.extensions?.code ?? e.message ?? "") ?? [];
    if (codes.includes("ACCESS_DENIED")) throw new ReconnectNeeded("Shopify ACCESS_DENIED");
    const cost = body?.extensions?.cost;
    if (codes.includes("THROTTLED") && attempt < THROTTLE_RETRIES) {
      await sleep(throttleWaitMs(cost), undefined, { signal });
      continue;
    }
    if (!res.ok || !body?.data || codes.length) throw new Error(`Shopify ${res.status}${codes.length ? `: ${codes.join(", ").slice(0, 300)}` : ""}`);
    return { data: body.data, cost };
  }
}

export type ShopifyVariant = {
  id: string;
  sku: string | null;
  title: string;
  price: string | null;
  compareAtPrice: string | null;
  inventoryQuantity: number | null;
  availableForSale: boolean;
  product: {
    title: string;
    handle: string;
    onlineStoreUrl: string | null;
    productType: string;
    description: string;
    status: string;
    featuredMedia: { preview?: { image?: { url: string } | null } | null } | null;
  };
};

const VARIANTS = `query Variants($after: String) {
  shop { currencyCode }
  productVariants(first: 100, after: $after, query: "product_status:active") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id sku title price compareAtPrice inventoryQuantity availableForSale
      product { title handle onlineStoreUrl productType description status featuredMedia { preview { image { url } } } }
    }
  }
}`;

const MAX_PAGES = 50;

/**
 * Every variant of the store's ACTIVE products. `complete` is false when the page cap stopped it early.
 * 100 variants a page keeps a page's requested cost well under the 1,000-point query limit; before the next page
 * it waits while the bucket holds less than the last page asked for.
 * ponytail: 50 pages × 100 = 5,000 variants and one request at a time; a bigger store stays incomplete
 * (nothing archived) until this moves to a bulk operation (bulkOperationRunQuery).
 */
export async function shopifyVariants(shop: string, accessToken: string, signal?: AbortSignal) {
  const variants: ShopifyVariant[] = [];
  let currency: string | null = null;
  let after: string | null = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, cost }: {
      data: {
        shop: { currencyCode: string };
        productVariants: { pageInfo: { hasNextPage: boolean; endCursor: string | null }; nodes: ShopifyVariant[] };
      };
      cost: Cost | undefined;
    } = await shopifyQuery(shop, accessToken, VARIANTS, { after }, signal);
    currency = data.shop.currencyCode;
    variants.push(...data.productVariants.nodes.filter((v) => v.product?.status === "ACTIVE"));
    if (!data.productVariants.pageInfo.hasNextPage) return { variants, currency, complete: true };
    after = data.productVariants.pageInfo.endCursor;
    if (cost && cost.throttleStatus.currentlyAvailable < cost.requestedQueryCost) await sleep(throttleWaitMs(cost), undefined, { signal });
  }
  return { variants, currency, complete: false };
}
