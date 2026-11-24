// Client-side contract for the products API (app/api/v1/.../brands/[brandId]/products). Keep in sync with the routes.
import { request } from "@/components/settings/api";
import type { CatalogSync, ImportField, ImportPreviewDto, ImportResultDto } from "@/shared";
/** Shared with the server (the chat says the same thing). */
export { stockLabel } from "@/shared";

export type { CatalogSync };

/** IMPORT: from the person's spreadsheet; SITE: read from the website's product pages. */
export type Source = "WEBSITE" | "SHOPIFY" | "SITE" | "MANUAL" | "IMPORT";
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
export type CatalogStatus = { source: "WEBSITE" | "SHOPIFY" | "SITE" | null; catalogSync: CatalogSync | null; running: boolean };
export type Catalogue = CatalogStatus & { products: Product[] };
/** The page sizes the server accepts (PRODUCT_PAGE_SIZES). */
export const PAGE_SIZES = [20, 50, 100] as const;
export type PageQuery = { page: number; limit: number; q: string; stock: "" | "in" | "out" };
/** `pagination.page` is the page served, which the server clamps to the last one. */
export type ProductPage = { products: Product[]; pagination: { page: number; limit: number; total: number; totalPages: number } };

const base = (w: string, b: string) => `/api/v1/workspaces/${encodeURIComponent(w)}/brands/${encodeURIComponent(b)}/products`;
const one = (w: string, b: string, id: string) => `${base(w, b)}/${encodeURIComponent(id)}`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });
/** The import form: the file, and the column mapping when there is one (the server guesses it otherwise). */
export function importForm(file: File, mapping?: (ImportField | null)[]) {
  const body = new FormData();
  body.append("file", file);
  if (mapping) body.append("mapping", JSON.stringify(mapping));
  return body;
}

export const productsApi = {
  /** The whole list: Campaigns' picker needs every product. The table reads `page`. */
  list: (w: string, b: string) => request<Catalogue>(base(w, b)),
  page: (w: string, b: string, { page, limit, q, stock }: PageQuery) =>
    request<ProductPage>(`${base(w, b)}?${new URLSearchParams({ page: String(page), limit: String(limit), ...(q ? { q } : {}), ...(stock ? { stock } : {}) })}`),
  /** The sync status alone: what the board polls while a sync runs. */
  status: (w: string, b: string) => request<CatalogStatus>(`${base(w, b)}?status=1`),
  get: (w: string, b: string, id: string) => request<{ product: FullProduct }>(one(w, b, id)),
  create: (w: string, b: string, body: Record<string, unknown>) => request<{ product: FullProduct }>(base(w, b), json("POST", body)),
  update: (w: string, b: string, id: string, body: Record<string, unknown>) => request<{ product: FullProduct }>(one(w, b, id), json("PATCH", body)),
  remove: (w: string, b: string, id: string) => request<void>(one(w, b, id), { method: "DELETE" }),
  /** `queued: false` when a sync was already queued or running. */
  sync: (w: string, b: string) => request<{ queued: boolean }>(`${base(w, b)}/sync`, { method: "POST" }),
  /** Nothing is written: the columns matched to fields (or `mapping`), the first rows, and what would be skipped. */
  previewImport: (w: string, b: string, file: File, mapping?: (ImportField | null)[]) =>
    request<ImportPreviewDto>(`${base(w, b)}/import?dryRun=1`, { method: "POST", body: importForm(file, mapping), timeoutMs: 60_000 }),
  /** The file is sent again (nothing is kept between the preview and the import). */
  importFile: (w: string, b: string, file: File, mapping: (ImportField | null)[]) =>
    request<ImportResultDto>(`${base(w, b)}/import`, { method: "POST", body: importForm(file, mapping), timeoutMs: 60_000 }),
};

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
