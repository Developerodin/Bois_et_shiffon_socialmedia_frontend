import type { IntegrationConnection, Prisma } from "@prisma/client";
import { z } from "zod";
import { SHOPIFY_REFUSED, shopifyVariants, type ShopifyVariant } from "@/server/catalog/shopify";
import { prisma } from "@/server/db/prisma";
import { enqueueJob } from "@/server/jobs/queue";
import { shopifySized } from "@/server/research/brand-assets";
import { htmlText, safeFetch, safeFetchBytes } from "@/server/research/crawl";
import { accessToken, markReconnect, ReconnectNeeded } from "@/server/services/connections";

/**
 * Product catalogue sync (docs/superpowers/specs/2026-11-05-product-catalogue-design.md).
 * One synced source per brand: SHOPIFY when a Shopify connection exists (a broken one stays visible as an
 * error rather than silently falling back), else the website's public /products.json feed. A sync writes only
 * the fields it owns; materials, dimensions and certifications stay the person's. Rows it no longer sees, and
 * rows of the other synced source, are archived only after a complete fetch.
 */
export const CATALOG_SYNC_JOB = "catalog.sync";

type Scope = { workspaceId: string; brandId: string };
type SyncedSource = "WEBSITE" | "SHOPIFY";
/** `error` is the message the web shows; `reason` lets the app say it in the person's language. */
export type CatalogSync = { at: string; source: SyncedSource | null; count: number; error: string | null; reason?: SyncReason | null };
export type SyncReason = "not-a-feed" | "partial" | "failed" | "shopify-refused";
type Note = { error: string; reason: SyncReason };

/** What a sync writes: every field it owns, except stockCheckedAt and archivedAt, which saving sets. */
export type SyncedRow = {
  externalId: string;
  sku: string | null;
  title: string;
  url: string | null;
  category: string | null;
  description: string | null;
  price: string | null;
  compareAtPrice: string | null;
  currency: string | null;
  inStock: boolean | null;
  stockQuantity: number | null;
  imageUrl: string | null;
};
type Fetched = { rows: SyncedRow[]; complete: boolean; note?: Note };

const FEED_PAGES = 20;
const FEED_PAGE_SIZE = 250;
// A full page of 250 products with their HTML descriptions runs to a few MB; safeFetch's 1 MB cap would cut it.
const FEED_BYTES = 10_000_000;
// ponytail: one sync reads at most 5,000 rows (variants) within 4 minutes; past either it stops early and archives
// nothing. A bigger catalogue needs Shopify's bulk operations and a job that can run longer than one request.
export const MAX_ROWS = 5000;
const DEADLINE_MS = 240_000;
const NOT_A_FEED: Note = { error: "Your website doesn't publish a product feed we can read (Shopify stores do). Connect Shopify or add products by hand.", reason: "not-a-feed" };
const PARTIAL: Note = { error: "Only part of the catalogue could be read, so no products were archived.", reason: "partial" };
const FAILED: Note = { error: "The last sync couldn't read the products. Press Sync now to try again.", reason: "failed" };
const REFUSED: Note = { error: SHOPIFY_REFUSED, reason: "shopify-refused" };

const str = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** "12.50", 12.5 → "12.50"; empty, negative, NaN, ≥ 1e9 (ProductInput's cap) or non-numeric → null (the feed is untrusted). */
export function parsePrice(v: unknown): string | null {
  if (typeof v !== "number" && (typeof v !== "string" || !v.trim())) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n < 1e9 ? n.toFixed(2) : null;
}

export function httpUrl(v: unknown): string | null {
  const s = str(v, 2000);
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

/** "Chair" + "Oak / Large" → "Chair — Oak / Large"; Shopify's single-variant "Default Title" adds nothing. */
export function variantTitle(product: string, variant: unknown) {
  const v = str(variant, 150);
  return (v && v !== "Default Title" ? `${product} — ${v}` : product).slice(0, 300);
}

/** Rows from one page of a public /products.json feed: one per variant. Malformed entries are skipped. */
export function websiteRows(products: unknown[], origin: string, currency: string | null): SyncedRow[] {
  return products.flatMap((raw) => {
    const p = raw as Record<string, unknown> | null;
    const title = str(p?.title, 200);
    const handle = str(p?.handle, 255);
    if (!p || !title || !handle || !Array.isArray(p.variants)) return [];
    const url = new URL(`/products/${encodeURIComponent(handle)}`, origin).toString();
    const description = str(typeof p.body_html === "string" ? htmlText(p.body_html) : null, 5000);
    const category = str(p.product_type, 120);
    const productImage = Array.isArray(p.images) ? p.images[0]?.src : undefined;
    return p.variants.flatMap((v) => {
      const id = typeof v?.id === "number" || typeof v?.id === "string" ? String(v.id).trim().slice(0, 100) : "";
      if (!id) return [];
      const image = v.featured_image?.src ?? productImage;
      return [{
        externalId: id,
        sku: str(v.sku, 100),
        title: variantTitle(title, v.title),
        url,
        category,
        description,
        price: parsePrice(v.price),
        compareAtPrice: parsePrice(v.compare_at_price),
        currency,
        inStock: typeof v.available === "boolean" ? v.available : null,
        stockQuantity: null,
        imageUrl: typeof image === "string" ? httpUrl(shopifySized(image)) : null,
      }];
    });
  });
}

export function shopifyRows(variants: ShopifyVariant[], currency: string | null): SyncedRow[] {
  return variants.map((v) => ({
    externalId: v.id,
    sku: str(v.sku, 100),
    title: variantTitle(str(v.product.title, 200) ?? "Untitled product", v.title),
    url: httpUrl(v.product.onlineStoreUrl),
    category: str(v.product.productType, 120),
    description: str(v.product.description, 5000),
    price: parsePrice(v.price),
    compareAtPrice: parsePrice(v.compareAtPrice),
    currency,
    inStock: typeof v.availableForSale === "boolean" ? v.availableForSale : null,
    stockQuantity: Number.isInteger(v.inventoryQuantity) ? v.inventoryQuantity : null,
    imageUrl: httpUrl(v.product.featuredMedia?.preview?.image?.url),
  }));
}

/** "gid://shopify/ProductVariant/123" → "123": the same variant's id in the public feed (WEBSITE rows). */
export const variantNumericId = (gid: string) => /^gid:\/\/shopify\/ProductVariant\/(\d+)$/.exec(gid)?.[1] ?? null;

/** At most MAX_ROWS rows; more means the fetch was cut short, so it's partial (nothing archived). */
export function capRows(fetched: Fetched): Fetched {
  return fetched.rows.length > MAX_ROWS ? { rows: fetched.rows.slice(0, MAX_ROWS), complete: false, note: PARTIAL } : fetched;
}

/**
 * The rows a sync archives, or null when it must archive nothing (a partial fetch). MANUAL rows never match.
 * An empty `seen` after a complete fetch archives every row of that source: the store really is empty.
 */
export function archiveWhere(scope: Scope, source: SyncedSource, seen: string[], complete: boolean): Prisma.ProductWhereInput | null {
  if (!complete) return null;
  return {
    workspaceId: scope.workspaceId,
    brandId: scope.brandId,
    archivedAt: null,
    OR: [{ source: source === "SHOPIFY" ? "WEBSITE" : "SHOPIFY" }, { source, externalId: { notIn: seen } }],
  };
}

async function cartCurrency(origin: string, signal?: AbortSignal) {
  const res = await safeFetch(new URL("/cart.js", origin).toString(), "application/json", signal).catch(() => null);
  try {
    const c = res?.status === 200 ? (JSON.parse(res.body) as { currency?: unknown }).currency : null;
    return typeof c === "string" && /^[A-Z]{3}$/.test(c) ? c : null;
  } catch {
    return null;
  }
}

/**
 * The public Shopify feed, 250 products a page, through the crawler's SSRF guard and size cap.
 * Not a feed on page 1 (404, HTML) → nothing, with a note; a server error or a broken later page throws (retried).
 * Stops once it holds more than MAX_ROWS variants (partial). `signal` is the sync's overall deadline.
 * ponytail: 20 pages (5,000 products); a bigger catalogue stays incomplete (nothing archived): connect Shopify Admin.
 */
export async function websiteFeed(websiteUrl: string, signal?: AbortSignal): Promise<Fetched> {
  let origin = new URL(websiteUrl).origin;
  let currency: string | null = null;
  const rows: SyncedRow[] = [];
  for (let page = 1; page <= FEED_PAGES; page++) {
    const res = await safeFetchBytes(new URL(`/products.json?limit=${FEED_PAGE_SIZE}&page=${page}`, origin).toString(), "application/json", FEED_BYTES, signal, 30_000);
    if (res.status === 429 || res.status >= 500 || res.truncated) throw new Error(`Product feed page ${page}: ${res.truncated ? "too large" : res.status}`);
    let list: unknown = null;
    try {
      list = res.status === 200 ? (JSON.parse(Buffer.from(res.bytes).toString("utf8")) as { products?: unknown })?.products : null;
    } catch {
      // not JSON: an HTML page, so not a Shopify feed
    }
    if (!Array.isArray(list)) {
      if (page === 1) return { rows: [], complete: false, note: NOT_A_FEED };
      throw new Error(`Product feed page ${page}: not a product list`);
    }
    if (page === 1) {
      origin = res.url.origin; // after redirects (e.g. → www.)
      currency = await cartCurrency(origin, signal);
    }
    rows.push(...websiteRows(list, origin, currency));
    if (list.length < FEED_PAGE_SIZE) return capRows({ rows, complete: true });
    if (rows.length > MAX_ROWS) break;
  }
  return capRows({ rows, complete: false, note: PARTIAL });
}

/** The connection's store (its account id is the shop domain), token via accessToken(), which throws ReconnectNeeded. */
async function shopifyFeed(conn: IntegrationConnection, signal: AbortSignal): Promise<Fetched> {
  const { variants, currency, complete } = await shopifyVariants(conn.externalAccountId, await accessToken(conn), signal);
  return capRows({ rows: shopifyRows(variants, currency), complete, note: complete ? undefined : PARTIAL });
}

/** Which source a brand syncs from: its newest working Shopify connection, else a broken one, else the website. */
export async function catalogSource(scope: Scope) {
  const shop = await prisma.integrationConnection.findFirst({
    where: { workspaceId: scope.workspaceId, brandId: scope.brandId, provider: "SHOPIFY", status: { not: "REVOKED" } },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
  });
  if (shop) return { source: "SHOPIFY" as const, shop };
  const profile = await prisma.brandProfile.findFirst({ where: { workspaceId: scope.workspaceId, brandId: scope.brandId }, select: { websiteUrl: true } });
  return profile?.websiteUrl ? { source: "WEBSITE" as const, websiteUrl: profile.websiteUrl } : { source: null };
}

/** The fields a sync owns (SyncedRow's keys), read back to tell changed rows from unchanged ones. */
const OWNED = {
  id: true, externalId: true, archivedAt: true, sku: true, title: true, url: true, category: true, description: true,
  price: true, compareAtPrice: true, currency: true, inStock: true, stockQuantity: true, imageUrl: true,
} satisfies Prisma.ProductSelect;
const CHUNK = 1000;
const chunks = <T>(list: T[]) => Array.from({ length: Math.ceil(list.length / CHUNK) }, (_, i) => list.slice(i * CHUNK, (i + 1) * CHUNK));

/** True when a stored row already holds what the source says (prices compared as numbers: Decimal prints "12.5"). */
export function sameRow(stored: Record<keyof SyncedRow, unknown> & { archivedAt: Date | null }, row: SyncedRow) {
  if (stored.archivedAt) return false;
  return (Object.keys(row) as (keyof SyncedRow)[]).every((k) =>
    k === "price" || k === "compareAtPrice" ? (stored[k] == null ? row[k] === null : row[k] !== null && Number(stored[k]) === Number(row[k])) : (stored[k] ?? null) === row[k],
  );
}

/**
 * Write what changed, then archive what the source no longer has (complete fetches only). Returns rows seen.
 * A row sent without a currency (the website's /cart.js failed) keeps the stored one. New SHOPIFY rows take the
 * person's facts from the same variant's WEBSITE row, so switching to Shopify keeps them.
 * New rows go in with createMany, changed rows are updated one by one, and every row whose stock the source
 * reported gets `stockCheckedAt` in one bulk update: a daily sync of an unchanged catalogue is a handful of queries.
 * ponytail: a run where most rows changed (e.g. a store-wide price change) still updates row by row, ~0.1 s each
 * from far away; batch with UPDATE … FROM (VALUES …) if that shows up.
 */
async function saveRows(scope: Scope, source: SyncedSource, fetched: Fetched) {
  const now = new Date();
  const where = { workspaceId: scope.workspaceId, brandId: scope.brandId, source };
  const stored = new Map(
    (await prisma.product.findMany({ where, select: OWNED })).map((p) => [p.externalId, p]),
  );
  const rows = [...new Map(fetched.rows.map((r) => [r.externalId, r])).values()].map((r) => {
    const keep = r.currency === null ? stored.get(r.externalId)?.currency : null;
    return keep ? { ...r, currency: keep } : r;
  });
  const created = rows.filter((r) => !stored.has(r.externalId));
  const facts = new Map<string, { materials: string | null; dimensions: string | null; certifications: string | null }>();
  if (source === "SHOPIFY" && created.length) {
    const website = await prisma.product.findMany({
      where: { workspaceId: scope.workspaceId, brandId: scope.brandId, source: "WEBSITE", externalId: { in: created.flatMap((r) => variantNumericId(r.externalId) ?? []) } },
      select: { externalId: true, materials: true, dimensions: true, certifications: true },
    });
    for (const { externalId, ...f } of website) if (externalId) facts.set(externalId, f);
  }
  for (const part of chunks(created)) {
    await prisma.product.createMany({ data: part.map((r) => ({ ...facts.get(variantNumericId(r.externalId) ?? ""), ...r, ...where })), skipDuplicates: true });
  }
  for (const r of rows) {
    const s = stored.get(r.externalId);
    if (s && !sameRow(s, r)) await prisma.product.update({ where: { id: s.id }, data: { ...r, archivedAt: null } });
  }
  const reported = rows.filter((r) => r.inStock !== null || r.stockQuantity !== null).map((r) => r.externalId);
  for (const part of chunks(reported)) await prisma.product.updateMany({ where: { ...where, externalId: { in: part } }, data: { stockCheckedAt: now } });
  const gone = archiveWhere(scope, source, rows.map((r) => r.externalId), fetched.complete);
  if (gone) await prisma.product.updateMany({ where: gone, data: { archivedAt: now } });
  return rows.length;
}

/** With no Shopify connection and no website feed, nothing updates SHOPIFY rows any more: their stock would go stale. */
const archiveShopifyRows = (scope: Scope) =>
  prisma.product.updateMany({ where: { workspaceId: scope.workspaceId, brandId: scope.brandId, source: "SHOPIFY", archivedAt: null }, data: { archivedAt: new Date() } });

const record = (scope: Scope, sync: Pick<CatalogSync, "at" | "source" | "count">, note: Note | null) =>
  prisma.brandProfile.updateMany({
    where: { workspaceId: scope.workspaceId, brandId: scope.brandId },
    data: { catalogSync: { ...sync, error: note?.error ?? null, reason: note?.reason ?? null } },
  });

const Payload = z.object({ workspaceId: z.string(), brandId: z.string() });

/**
 * Job handler. Network errors throw (retried); a refused Shopify token marks the connection and throws
 * ReconnectNeeded (the runner doesn't retry it). Every fetch of one sync shares a 4-minute deadline.
 */
export async function runCatalogSync(payload: unknown) {
  const scope = Payload.parse(payload);
  const at = new Date().toISOString();
  const found = await catalogSource(scope);
  if (found.source === null) {
    await archiveShopifyRows(scope);
    return void (await record(scope, { at, source: null, count: 0 }, null));
  }
  if (found.source === "SHOPIFY" && found.shop.status !== "ACTIVE") {
    // The connection's own lastError (e.g. set by a refused sync) is the message; the app says "reconnect".
    return void (await record(scope, { at, source: "SHOPIFY", count: 0 }, { ...REFUSED, error: found.shop.lastError ?? SHOPIFY_REFUSED }));
  }
  const signal = AbortSignal.timeout(DEADLINE_MS);
  try {
    const fetched = found.source === "SHOPIFY" ? await shopifyFeed(found.shop, signal) : await websiteFeed(found.websiteUrl, signal);
    if (fetched.note === NOT_A_FEED) await archiveShopifyRows(scope);
    const count = await saveRows(scope, found.source, fetched);
    await record(scope, { at, source: found.source, count }, fetched.note ?? null);
  } catch (error) {
    const refused = error instanceof ReconnectNeeded;
    if (refused && found.source === "SHOPIFY") await markReconnect(found.shop.id, SHOPIFY_REFUSED);
    // Messages here carry statuses and Shopify error codes only, never a token.
    console.warn("[catalog] sync failed", scope.brandId, found.source, error instanceof Error ? error.message : error);
    await record(scope, { at, source: found.source, count: 0 }, refused ? REFUSED : FAILED);
    throw error;
  }
}

/** Queue a sync. `key` dedupes (the day for the daily sweep, the connect time); without one it's always a new job. */
export function enqueueCatalogSync(scope: Scope, key?: string) {
  return enqueueJob({
    type: CATALOG_SYNC_JOB,
    workspaceId: scope.workspaceId,
    brandId: scope.brandId,
    payload: scope,
    idempotencyKey: key && `catalog-sync:${scope.brandId}:${key}`,
  });
}

/** True while a sync for this brand is queued or running (what the screens poll for). */
export async function catalogSyncRunning(scope: Scope) {
  const job = await prisma.job.findFirst({
    where: { type: CATALOG_SYNC_JOB, workspaceId: scope.workspaceId, brandId: scope.brandId, status: { in: ["PENDING", "RUNNING"] } },
    select: { id: true },
  });
  return job !== null;
}

/**
 * "Sync now": nothing new while this brand's sync is queued or running (a double click, two people), else a new job.
 * ponytail: check-then-create, so two presses in the same instant can queue two syncs; they run one after the
 * other and the second finds nothing changed.
 */
export async function requestCatalogSync(scope: Scope) {
  if (await catalogSyncRunning(scope)) return { queued: false };
  await enqueueCatalogSync(scope);
  return { queued: true };
}

/** Daily sweep: every active brand with a website or a working Shopify connection. */
export async function enqueueDailyCatalogSyncs() {
  const day = new Date().toISOString().slice(0, 10);
  const brands = await prisma.brand.findMany({
    where: {
      status: "ACTIVE",
      // Leftover SHOPIFY rows too: their sync archives them once the store is gone and there is no website feed.
      OR: [
        { profile: { websiteUrl: { not: null } } },
        { connections: { some: { provider: "SHOPIFY", status: "ACTIVE" } } },
        { products: { some: { source: "SHOPIFY", archivedAt: null } } },
      ],
    },
    select: { id: true, workspaceId: true },
  });
  for (const b of brands) await enqueueCatalogSync({ workspaceId: b.workspaceId, brandId: b.id }, day);
}
