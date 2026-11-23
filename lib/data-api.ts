// The Performance data tabs' routes and DTOs.
// Mirror of server shared/data-sources.ts (and shared/api/search.ts, shared/api/sales.ts) — replace with the synced type at merge.

export type DataSourceKind = "SEARCH_CONSOLE" | "POST_METRICS" | "SHOPIFY_ORDERS" | "META_ADS";
export type SyncReason = "reconnect" | "permission" | "partial" | "failed" | "rate-limited" | null;
export type DataSourceDto = {
  kind: DataSourceKind;
  /** Site URL or shop domain; only for people with integrations.manage. */
  label?: string;
  status: "ACTIVE" | "ERROR" | "OFF";
  /** `okAt`: the last successful sync ("Updated …"). */
  lastResult: { at: string; okAt?: string | null; reason: SyncReason; count?: number; error?: string | null } | null;
  syncedThrough: string | null;
  /** The zone the provider's days are in when it isn't the brand's (Search Console: Pacific time). */
  reportsInZone: string | null;
};
/** GET data-sources. `timeZone`: the brand's zone, for the date presets (the browser's when absent). */
export type DataSourcesResponse = { sources: DataSourceDto[]; timeZone?: string | null };

/** `position` = positionSum / impressions, null with no impressions; `ctr` 0–1. */
export type SearchTotals = { clicks: number; impressions: number; ctr: number; position: number | null };
export type SearchSummary = { totals: SearchTotals; previous: SearchTotals; days: (SearchTotals & { day: string })[] };
export type SearchPage = SearchTotals & { page: string };
export type SearchPages = { pages: SearchPage[]; nextCursor: string | null };
export type GoogleSite = { siteUrl: string; permissionLevel?: string };

/** Money is a decimal string in `currency`; never added across currencies. */
export type SalesTotals = { orders: number; gross: string; discounts: string; netSales: string; total: string; refunded: string };
export type SalesCurrency = { currency: string; totals: SalesTotals; previous: SalesTotals; days: (SalesTotals & { day: string })[] };
export type SalesSummary = { currencies: SalesCurrency[] };

/** URL slugs of the kinds, as the PUT routes name them (data-sources/search-console, …/shopify-orders). */
export const KIND_SLUG: Record<DataSourceKind, string> = {
  SEARCH_CONSOLE: "search-console",
  POST_METRICS: "post-metrics",
  SHOPIFY_ORDERS: "shopify-orders",
  META_ADS: "meta-ads",
};

/** What a failed or stopped sync means and what to do, keyed by the server's fixed reason. */
export const REASON_TEXT: Record<Exclude<SyncReason, null>, string> = {
  reconnect: "The connection needs signing in again. Reconnect it in Connections.",
  permission: "The account didn't allow reading these numbers. Reconnect it and allow access.",
  partial: "Some days are still loading.",
  "rate-limited": "The provider asked us to slow down; the next sync picks up the rest.",
  failed: "The last sync failed. Try Sync now, or wait for tomorrow's.",
};

// ---- Date range: brand-local YYYY-MM-DD days carried in ?from&to ----

export type DateRange = { from: string; to: string };
export const PRESETS = [7, 28, 90] as const;
export const DEFAULT_DAYS = 28;
export const MAX_DAYS = 90;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => iso(ms(d) + n * 86_400_000);
/** Days in the range, both ends counted. */
export const rangeDays = (r: DateRange) => Math.round((ms(r.to) - ms(r.from)) / 86_400_000) + 1;

/** Today's date in `timeZone` (an unknown zone falls back to UTC). */
export function zoneToday(timeZone: string | null | undefined, now = new Date()): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || undefined }).format(now);
  } catch {
    return iso(now.getTime());
  }
}

export const presetRange = (days: number, today: string): DateRange => ({ from: addDays(today, -(days - 1)), to: today });

/** The range in the URL when it is real, in order and at most 90 days; else the last 28 days. */
export function readRange(params: URLSearchParams, today: string): DateRange {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const ok = DAY.test(from) && DAY.test(to) && !Number.isNaN(ms(from)) && !Number.isNaN(ms(to)) && from <= to && rangeDays({ from, to }) <= MAX_DAYS;
  return ok ? { from, to } : presetRange(DEFAULT_DAYS, today);
}

/** The same URL with this range in it, other parameters kept. */
export function withRange(href: string, r: DateRange): string {
  const url = new URL(href);
  url.searchParams.set("from", r.from);
  url.searchParams.set("to", r.to);
  return url.toString();
}

/** "+12%" / "−3%" against the previous period; null when there is nothing to compare with. */
export function change(now: number, before: number): string | null {
  if (!before) return null;
  const p = Math.round(((now - before) / before) * 100);
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p)}%`;
}
