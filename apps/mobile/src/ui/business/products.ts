import type { TFunction } from "i18next";
import type { Product } from "@/api/endpoints";
import { formatNumber } from "@/i18n";

/** "€665.83", or the bare number when the currency is unknown. */
export function priceLabel(p: Pick<Product, "price" | "currency">) {
  if (p.price === null) return null;
  const n = Number(p.price);
  try {
    return p.currency ? formatNumber(n, { style: "currency", currency: p.currency }) : formatNumber(n, { minimumFractionDigits: 2 });
  } catch {
    return `${p.price} ${p.currency ?? ""}`.trim();
  }
}

export type StockTone = "in" | "out" | "unknown";
/**
 * "12 in stock" / "In stock" / "Out of stock" / "Stock unknown", and a tone for the pill. A count of 0 or less with
 * inStock true is an untracked item or one the store keeps selling: "In stock" (same rule as the web board).
 */
export function stockLabel(p: Pick<Product, "inStock" | "stockQuantity">, t: TFunction<"business">): { label: string; tone: StockTone } {
  if (p.stockQuantity !== null && p.stockQuantity > 0) return { label: t("products.stock.count", { n: formatNumber(p.stockQuantity) }), tone: "in" };
  if (p.inStock !== null) return p.inStock ? { label: t("products.stock.in"), tone: "in" } : { label: t("products.stock.out"), tone: "out" };
  return p.stockQuantity !== null ? { label: t("products.stock.out"), tone: "out" } : { label: t("products.stock.unknown"), tone: "unknown" };
}

/** "5 min ago", "3 h ago", "2 days ago": how fresh a stock answer or a sync is. */
export function ago(iso: string, t: TFunction<"business">, now = Date.now()) {
  const min = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (min < 1) return t("products.ago.now");
  if (min < 60) return t("products.ago.min", { n: min });
  const h = Math.round(min / 60);
  return h < 48 ? t("products.ago.hours", { n: h }) : t("products.ago.days", { n: Math.round(h / 24) });
}

/** A small rendition for thumbnails: Shopify's CDN resizes on request (feeds store 1200 px); other hosts as is. */
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
