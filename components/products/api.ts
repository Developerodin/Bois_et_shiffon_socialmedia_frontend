// Client-side contract for the products API (app/api/v1/.../brands/[brandId]/products). Keep in sync with the routes.
import { request } from "@/components/settings/api";
import type { CatalogSync } from "@/server/catalog/sync";

export type { CatalogSync };

export type Source = "WEBSITE" | "SHOPIFY" | "MANUAL";
/** A list row; the description comes with the single product (`productsApi.get`). */
export type Product = {
  id: string;
  source: Source;
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
