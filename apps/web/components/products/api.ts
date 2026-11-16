// Client-side contract for the products API (app/api/v1/.../brands/[brandId]/products). Keep in sync with the routes.
import { request } from "@/components/settings/api";
// eslint-disable-next-line no-restricted-imports -- converted in task 6
import type { CatalogSync } from "@/server/catalog/sync";

export type { CatalogSync };

export type Source = "WEBSITE" | "SHOPIFY" | "MANUAL";
/** A list row; the description comes with the single product (`productsApi.get`). */
export type Product = {
  id: string;
  source: Source;
  externalId: string | null;
  sku: string | null;
  title: string;
  url: string | null;
  category: string | null;
  materials: string | null;
  dimensions: string | null;
  certifications: string | null;
  price: string | null;
  compareAtPrice: string | null;
  currency: string | null;
  inStock: boolean | null;
  stockQuantity: number | null;
  stockCheckedAt: string | null;
  imageUrl: string | null;
  updatedAt: string;
};
export type FullProduct = Product & { description: string | null };
/** `running`: a sync is queued or running for the brand. */
export type CatalogStatus = { source: "WEBSITE" | "SHOPIFY" | null; catalogSync: CatalogSync | null; running: boolean };
export type Catalogue = CatalogStatus & { products: Product[] };

const base = (w: string, b: string) => `/api/v1/workspaces/${encodeURIComponent(w)}/brands/${encodeURIComponent(b)}/products`;
const one = (w: string, b: string, id: string) => `${base(w, b)}/${encodeURIComponent(id)}`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const productsApi = {
  list: (w: string, b: string) => request<Catalogue>(base(w, b)),
  /** The sync status alone: what the board polls while a sync runs. */
  status: (w: string, b: string) => request<CatalogStatus>(`${base(w, b)}?status=1`),
  get: (w: string, b: string, id: string) => request<{ product: FullProduct }>(one(w, b, id)),
  create: (w: string, b: string, body: Record<string, unknown>) => request<{ product: FullProduct }>(base(w, b), json("POST", body)),
  update: (w: string, b: string, id: string, body: Record<string, unknown>) => request<{ product: FullProduct }>(one(w, b, id), json("PATCH", body)),
  remove: (w: string, b: string, id: string) => request<void>(one(w, b, id), { method: "DELETE" }),
  /** `queued: false` when a sync was already queued or running. */
  sync: (w: string, b: string) => request<{ queued: boolean }>(`${base(w, b)}/sync`, { method: "POST" }),
};

/**
 * "12 in stock" / "In stock" / "Out of stock" / "Unknown". A count of 0 or less with inStock true is a store that
 * doesn't track that item's inventory or keeps selling it: it's for sale, so "In stock".
 */
export function stockLabel(p: Pick<Product, "inStock" | "stockQuantity">) {
  if (p.stockQuantity !== null && p.stockQuantity > 0) return `${p.stockQuantity} in stock`;
  if (p.inStock !== null) return p.inStock ? "In stock" : "Out of stock";
  return p.stockQuantity !== null ? "Out of stock" : "Unknown";
}

/** A small rendition for list thumbnails: Shopify's CDN resizes on request (feeds store 1200 px); other hosts as is. */
export function thumbUrl(url: string, px: number) {
  try {
    const u = new URL(url);
    if (u.hostname !== "cdn.shopify.com" && !u.pathname.includes("/cdn/shop/")) return url;
    u.searchParams.set("width", String(px));
    return u.toString();
  } catch {
    return url;
  }
}

/** A campaign as GET …/campaigns returns it (server/catalog/campaigns.ts toCampaignDto); `starts`/`ends` are brand wall-clock times. */
export type CampaignKind = "offer" | "campaign" | "priority";
export type Campaign = {
  id: string;
  kind: CampaignKind;
  name: string;
  startsAt: string;
  endsAt: string | null;
  starts: string;
  ends: string | null;
  productIds: string[];
  categories: string[];
  offer: string | null;
  discountPercent: number | null;
  code: string | null;
  /** Posts awaiting approval, approved or scheduled that link it: an edit that narrows it, or withdrawing it, holds them. */
  affectedPosts: { id: string; title: string; status: string; scheduledFor: string | null }[];
};
/** What the form sends: times as `YYYY-MM-DDTHH:mm` in the brand timezone. */
export type CampaignBody = Pick<Campaign, "name" | "productIds" | "categories" | "offer" | "discountPercent" | "code"> & { startsAt: string; endsAt: string | null };

const campaigns = (w: string, b: string) => `/api/v1/workspaces/${encodeURIComponent(w)}/brands/${encodeURIComponent(b)}/campaigns`;
export const campaignsApi = {
  /** `timeZone` null: not set yet (the first save asks for it). */
  list: (w: string, b: string) => request<{ timeZone: string | null; campaigns: Campaign[] }>(campaigns(w, b)),
  create: (w: string, b: string, body: CampaignBody) => request<{ campaign: Campaign }>(campaigns(w, b), json("POST", body)),
  update: (w: string, b: string, id: string, body: CampaignBody) => request<{ campaign: Campaign }>(`${campaigns(w, b)}/${encodeURIComponent(id)}`, json("PATCH", body)),
  /** Withdraw (archive); returns the posts it holds. */
  withdraw: (w: string, b: string, id: string) => request<{ campaign: Campaign }>(`${campaigns(w, b)}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setTimeZone: (w: string, b: string, timeZone: string) => request<{ timeZone: string }>(`${campaigns(w, b)}/time-zone`, json("PUT", { timeZone })),
};
