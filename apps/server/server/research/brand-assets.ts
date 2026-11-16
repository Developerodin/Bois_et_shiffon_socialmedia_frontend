import { createHash } from "node:crypto";
import sharp, { type Sharp } from "sharp";
import { z } from "zod";
import { prisma } from "@/server/db/prisma";
import { distinctColors, dominantColors, isNeutral, parseColor, toHex, type Rgb } from "@/server/research/colors";
import { fontFamilies, pageAssets, safeFetch, safeFetchBytes, safeSvg, type CrawledPage, type PageProduct } from "@/server/research/crawl";
import { mediaKey, putMedia } from "@/server/storage/media";
import type { TenantScope } from "@/server/tenant/scope";

/**
 * Logo, colours, fonts and product photos from the brand's website (mobile onboarding A06 → A09/A10).
 * Best-effort and AI-free: images are re-encoded by sharp into the brand's private media bucket so they
 * outlive changes on the store and agents can reuse them.
 * ponytail: deterministic keys, so a re-run overwrites; products removed from the store leave orphan
 * objects (same as the media route). Add a bucket lifecycle rule if storage grows.
 * Image URLs come from untrusted pages: every fetch goes through the crawler's SSRF guard. That guard
 * re-resolves DNS at fetch time (see crawl.ts); pinning the IP there covers these fetches too.
 * robots.txt governs the pages we crawl; the images those pages embed are fetched like a browser would.
 */
export const BrandAssets = z.object({
  collectedAt: z.string(),
  /** Research run that collected them: a retried run skips work it already did. */
  runId: z.string().optional(),
  logo: z.object({ key: z.string() }).nullable(),
  colors: z.array(z.object({ hex: z.string(), from: z.enum(["site", "logo", "products", "you"]) })),
  /** Set when a person edits the palette: Research then leaves `colors` alone. */
  colorsEditedAt: z.string().optional(),
  fonts: z.array(z.string()),
  products: z.array(z.object({ title: z.string(), kind: z.string().nullable(), url: z.string(), imageKey: z.string().nullable() })),
});
export type BrandAssets = z.infer<typeof BrandAssets>;

const MAX_PRODUCTS = 12;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_LOGO_TRIES = 3;
const PALETTE_PHOTOS = 6;
/** The whole collection shares one deadline so a slow site can't eat the Research job's 300 s budget. */
const DEADLINE_MS = 30_000;

// ponytail: one decode at a time keeps memory near one image (≤16 MP ≈ 64 MB RGBA) on a serverless box.
sharp.concurrency(1);
const IMAGE_FORMATS = new Set(["jpeg", "png", "webp", "gif"]);

type Product = PageProduct & { kind: string | null };

/** "boisetchiffons.fr" → "Boisetchiffons": the fallback when a site doesn't say its own name. */
export const nameFromHost = (url: string) =>
  new URL(url).hostname.replace(/^www\./, "").split(".")[0].replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * The name a website gives itself (og:site_name, JSON-LD Organization, application-name), else the host
 * placeholder. Brand creation waits on this, so it gets 5 s; a slow or broken site just falls back.
 */
export async function nameFromWebsite(url: string) {
  // ponytail: DNS lookup inside safeFetch isn't covered by this 5 s signal; a hung resolver falls back to its own timeout.
  const res = await safeFetch(url, "text/html", AbortSignal.timeout(5_000)).catch(() => null);
  let name: string | null = null;
  try {
    name = res?.status === 200 ? pageAssets(res.body, res.url).siteName : null;
  } catch {
    // a malformed page must never fail brand creation
  }
  return name ?? nameFromHost(url);
}

/** Shopify stores list their catalogue at /products.json; anything else (404, HTML) gives []. */
export async function shopifyProducts(origin: string, signal?: AbortSignal): Promise<Product[]> {
  const res = await safeFetch(new URL(`/products.json?limit=${MAX_PRODUCTS}`, origin).toString(), "application/json", signal).catch(() => null);
  if (res?.status !== 200 || !res.contentType.includes("json")) return [];
  let data: unknown;
  try {
    data = JSON.parse(res.body);
  } catch {
    return []; // includes a body cut at the size cap
  }
  const list = (data as { products?: unknown })?.products;
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_PRODUCTS).flatMap((p) => {
    if (typeof p?.title !== "string" || typeof p?.handle !== "string") return [];
    const src = p.images?.[0]?.src;
    const kind = typeof p.product_type === "string" && p.product_type.trim() ? p.product_type.trim().slice(0, 80) : null;
    return [{ title: p.title.slice(0, 200), url: new URL(`/products/${encodeURIComponent(p.handle)}`, origin).toString(), image: typeof src === "string" ? shopifySized(src) : null, kind }];
  });
}

/** Ask Shopify's CDN for a 1200px rendition instead of the 4000px original. */
export function shopifySized(src: string) {
  try {
    const u = new URL(src, "https://cdn.shopify.com");
    if (u.hostname === "cdn.shopify.com" || u.pathname.includes("/cdn/shop/")) u.searchParams.set("width", "1200");
    return u.toString();
  } catch {
    return src;
  }
}

/**
 * Download (SSRF-guarded, size-capped) → sharp decode (raster formats only, pixel cap against
 * decompression bombs) → re-encode ≤1200px without metadata → private bucket. Null when anything fails.
 */
export async function storeImage(scope: Required<TenantScope>, url: string, name: string, as: "jpeg" | "png", signal?: AbortSignal, versioned = false) {
  const res = await safeFetchBytes(url, "image/webp,image/png,image/jpeg,image/gif;q=0.8", MAX_IMAGE_BYTES, signal).catch(() => null);
  if (!res || res.status !== 200 || res.truncated || res.bytes.length === 0) return null;
  try {
    const img = sharp(res.bytes, { limitInputPixels: 16_000_000, sequentialRead: true });
    const { format } = await img.metadata();
    if (!format || !IMAGE_FORMATS.has(format)) return null; // SVG files, ICO, HTML error pages…
    return await encodeAndStore(scope, img, name, as, versioned);
  } catch {
    return null;
  }
}

/**
 * A logo drawn as inline SVG (see crawl.ts inlineSvgLogos): rendered to PNG only when safeSvg passes (no scripts,
 * external references or embedded files), at a density that makes it ~800px wide so small vectors stay sharp.
 * ponytail: a white logo (made for a dark header) comes out white on transparent; fine on dark tiles only.
 */
export async function storeSvgLogo(scope: Required<TenantScope>, svg: string, name: string) {
  if (!safeSvg(svg)) return null;
  try {
    const { width, format } = await sharp(Buffer.from(svg)).metadata();
    if (format !== "svg" || !width) return null;
    const density = Math.min(2400, Math.max(72, Math.round((72 * 800) / width)));
    return await encodeAndStore(scope, sharp(Buffer.from(svg), { density, limitInputPixels: 16_000_000 }), name, "png", true);
  } catch {
    return null;
  }
}

/** Resize ≤1200px without metadata, encode, keep a 24px thumbnail for colours, put in the brand's private bucket. */
async function encodeAndStore(scope: Required<TenantScope>, img: Sharp, name: string, as: "jpeg" | "png", versioned: boolean) {
  const sized = img.rotate().resize(1200, 1200, { fit: "inside", withoutEnlargement: true });
  const body = as === "png" ? await sized.clone().png().toBuffer() : await sized.clone().flatten({ background: "#ffffff" }).jpeg({ quality: 80 }).toBuffer();
  const thumb = await sized.clone().resize(24, 24, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // versioned: the key changes with the content, so apps caching by key show a new logo instead of the old one
  const key = mediaKey(scope, `${versioned ? `${name}-${hash(body.toString("base64"))}` : name}.${as === "png" ? "png" : "jpg"}`);
  await putMedia(key, body, `image/${as}`);
  return { key, colors: dominantColors(thumb.data, thumb.info.channels) };
}

/** Run `fn` over items, `limit` at a time, keeping order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/** Most-used fonts first. One-off fonts are usually a widget's, not the brand's: keep fonts used twice or more (else the top one), max 3. */
export function rankFonts(uses: string[]) {
  const count = new Map<string, number>();
  for (const f of uses) count.set(f, (count.get(f) ?? 0) + 1);
  const ranked = [...count].sort((a, b) => b[1] - a[1]);
  return (ranked.some(([, n]) => n >= 2) ? ranked.filter(([, n]) => n >= 2) : ranked.slice(0, 1)).slice(0, 3).map(([f]) => f);
}

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

/**
 * Collect from the crawled pages (+ Shopify catalogue), store images, save on BrandProfile.assets.
 * Returns null when skipped (already collected by this run). A run that finds nothing keeps the
 * previous assets: a site outage must not wipe good data.
 * Overwrites the set except colours a person edited (saveCollected); fonts/logo editing would need the same.
 */
export async function collectBrandAssets(scope: Required<TenantScope>, websiteUrl: string, pages: CrawledPage[], runId: string): Promise<BrandAssets | null> {
  const profile = await prisma.brandProfile.findFirst({ where: { brandId: scope.brandId, workspaceId: scope.workspaceId }, select: { assets: true } });
  const previous = BrandAssets.safeParse(profile?.assets).data;
  if (previous?.runId === runId) return null;
  const signal = AbortSignal.timeout(DEADLINE_MS);
  const origin = new URL(pages[0]?.url ?? websiteUrl).origin; // after redirects (e.g. → www.)
  const found = pages.flatMap((p) => (p.assets ? [p.assets] : []));
  const home = pages[0]?.assets;

  // Keyed by URL + title: JSON-LD products without a url all fall back to the page URL.
  const products = new Map<string, Product>();
  for (const p of [...(await shopifyProducts(origin, signal)), ...found.flatMap((a) => a.products.map((x) => ({ ...x, kind: null })))]) {
    const key = `${p.url}|${p.title}`;
    if (products.size < MAX_PRODUCTS && !products.has(key)) products.set(key, p);
  }

  // A logo image first, then a logo drawn as inline SVG, and the site icon (often a favicon) only as a last resort.
  let logo: Awaited<ReturnType<typeof storeImage>> = null;
  for (const url of [...new Set(found.flatMap((a) => a.logos))].slice(0, MAX_LOGO_TRIES)) {
    logo = await storeImage(scope, url, "brand-logo", "png", signal, true);
    if (logo) break;
  }
  for (const svg of logo ? [] : [...new Set(found.flatMap((a) => a.inlineLogos))].slice(0, MAX_LOGO_TRIES)) {
    logo = await storeSvgLogo(scope, svg, "brand-logo");
    if (logo) break;
  }
  for (const url of logo ? [] : [...new Set(found.flatMap((a) => a.icons))].slice(0, MAX_LOGO_TRIES)) {
    logo = await storeImage(scope, url, "brand-logo", "png", signal, true);
    if (logo) break;
  }

  const list = [...products.values()];
  const stored = await mapLimit(list, 3, (p) => (p.image ? storeImage(scope, p.image, `product-${hash(`${p.url}|${p.title}`)}`, "jpeg", signal) : Promise.resolve(null)));

  // The site's declared theme-color, then the logo, then each photo's main colour before any photo's second,
  // then the most-used theme CSS colours (often theme defaults, so last).
  const siteColors = (raws: (string | null)[]) => {
    const counts = new Map<string, { rgb: Rgb; n: number }>();
    for (const raw of raws) {
      const rgb = raw ? parseColor(raw) : null;
      if (!rgb || isNeutral(rgb)) continue;
      const c = counts.get(toHex(rgb)) ?? { rgb, n: 0 };
      c.n++;
      counts.set(toHex(rgb), c);
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).map((c) => ({ rgb: c.rgb, from: "site" as const }));
  };
  const photoColors = stored.slice(0, PALETTE_PHOTOS).map((s) => s?.colors ?? []);
  const candidates = [
    ...siteColors(found.map((a) => a.themeColor)),
    ...(logo?.colors ?? []).map((rgb) => ({ rgb, from: "logo" as const })),
    ...[0, 1, 2].flatMap((rank) => photoColors.flatMap((c) => (c[rank] ? [{ rgb: c[rank], from: "products" as const }] : []))),
    ...siteColors(found.flatMap((a) => a.cssColors)),
  ];
  // Fonts by use across the pages and the homepage's theme stylesheets (fetched together, same deadline).
  const sheets = await Promise.all(
    (home?.stylesheets ?? []).map((url) =>
      safeFetch(url, "text/css", signal)
        .then((r) => (r.status === 200 ? fontFamilies(r.body) : []))
        .catch(() => []),
    ),
  );
  // Homepage only: every page repeats the same template, so counting all pages only amplifies header widgets.
  const fonts = rankFonts([...(home?.fonts ?? []), ...sheets.flat()]);

  const fresh = {
    logo: logo ? { key: logo.key } : null,
    colors: distinctColors(candidates, 5).map((c) => ({ hex: toHex(c.rgb), from: c.from })),
    fonts,
    products: list.map((p, i) => ({ title: p.title, kind: p.kind, url: p.url, imageKey: stored[i]?.key ?? null })),
  };
  if (!fresh.logo && !fresh.colors.length && !fresh.fonts.length && !fresh.products.length) return { collectedAt: new Date().toISOString(), runId, ...fresh };
  // A part that failed this time (store rate-limited /products.json, logo timed out) keeps what the last run found.
  const assets: BrandAssets = {
    collectedAt: new Date().toISOString(),
    runId,
    logo: fresh.logo ?? previous?.logo ?? null,
    colors: fresh.colors.length ? fresh.colors : (previous?.colors ?? []),
    fonts: fresh.fonts.length ? fresh.fonts : (previous?.fonts ?? []),
    products: fresh.products.length ? fresh.products : (previous?.products ?? []),
  };
  await saveCollected(scope, assets);
  return assets;
}

/**
 * One statement, so a palette edit saved while Research was collecting can't be lost (and no lock is needed
 * on Neon's transaction-mode pooler): people's colours (`colorsEditedAt`) are carried over from the row as it is now.
 */
export async function saveCollected(scope: Required<TenantScope>, assets: BrandAssets) {
  const json = JSON.stringify(assets);
  await prisma.$executeRaw`
    UPDATE "BrandProfile" SET "updatedAt" = now(), "assets" = CASE
      WHEN "assets" -> 'colorsEditedAt' IS NOT NULL
        THEN ${json}::jsonb || jsonb_build_object('colors', "assets" -> 'colors', 'colorsEditedAt', "assets" -> 'colorsEditedAt')
      ELSE ${json}::jsonb END
    WHERE "brandId" = ${scope.brandId} AND "workspaceId" = ${scope.workspaceId}`;
}

/**
 * A person's palette: replaces `colors` only, in one statement (Research's products/logo written meanwhile stay).
 * Colours already in the palette keep their source label; new or changed ones are "you".
 */
export async function saveEditedColors(scope: Required<TenantScope>, hexes: string[]) {
  const row = await prisma.brandProfile.findFirst({ where: { brandId: scope.brandId, workspaceId: scope.workspaceId }, select: { assets: true } });
  const before = new Map((BrandAssets.safeParse(row?.assets).data?.colors ?? []).map((c) => [c.hex, c.from]));
  const colors = JSON.stringify(hexes.map((hex) => ({ hex, from: before.get(hex) ?? "you" })));
  const rows = await prisma.$executeRaw`
    UPDATE "BrandProfile" SET "updatedAt" = now(),
      "assets" = "assets" || jsonb_build_object('colors', ${colors}::jsonb, 'colorsEditedAt', ${new Date().toISOString()}::text)
    WHERE "brandId" = ${scope.brandId} AND "workspaceId" = ${scope.workspaceId} AND "assets" IS NOT NULL`;
  return rows > 0;
}
