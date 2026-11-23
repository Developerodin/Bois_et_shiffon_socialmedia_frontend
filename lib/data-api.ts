// The Performance data tabs' routes, DTOs and shared helpers.
// Mirror of server shared/data-sources.ts (and shared/api/search.ts, shared/api/sales.ts) — replace with the synced type at merge.

import { useEffect, useRef } from "react";
import { brandBase } from "@/lib/tasks-api";

export type DataSourceKind = "SEARCH_CONSOLE" | "POST_METRICS" | "SHOPIFY_ORDERS" | "META_ADS";
/** Why the last sync didn't fully succeed. */
export type DataSyncReason = "reconnect" | "permission" | "partial" | "failed" | "rate-limited";
/** `okAt`: the last successful sync ("Updated …"); `error`: the server's fixed text for `reason`. */
export type DataSyncResult = { at: string; okAt: string | null; reason: DataSyncReason | null; count: number; error: string | null };
export type DataSourceDto = {
  id: string;
  kind: DataSourceKind;
  /** Site URL, shop domain or ad account name; only for people with integrations.manage. */
  label?: string | null;
  status: "ACTIVE" | "ERROR" | "OFF";
  lastResult: DataSyncResult | null;
  /** "YYYY-MM-DD", the last provider day held contiguously. */
  syncedThrough: string | null;
  /** The zone the provider's days are in when it says (Search Console: Pacific; Meta Ads: the account's). */
  reportsInZone: string | null;
};
/** GET data-sources. `timeZone`: the brand's zone for the date presets, if the server sends it (else the browser's). */
export type DataSourcesResponse = { sources: DataSourceDto[]; timeZone?: string | null };

/** `ctr` 0–1 and `position` (impression-weighted), both null with no impressions. */
export type SearchTotals = { clicks: number; impressions: number; ctr: number | null; position: number | null };
export type SearchSummary = { totals: SearchTotals; previous: SearchTotals; days: (SearchTotals & { day: string })[] };
export type SearchPage = SearchTotals & { page: string };
export type SearchPages = { pages: SearchPage[]; nextCursor: string | null };
export type GoogleSite = { siteUrl: string; permissionLevel?: string };

/** Money is a decimal string in `currency`; never added across currencies. */
export type SalesTotals = { orders: number; gross: string; discounts: string; netSales: string; total: string; refunded: string };
export type SalesCurrency = { currency: string; totals: SalesTotals; previous: SalesTotals; days: (SalesTotals & { day: string })[] };
export type SalesSummary = { currencies: SalesCurrency[] };

/** URL slugs of the kinds (data-sources/:kind/sync, PUT data-sources/search-console, …). */
export const KIND_SLUG: Record<DataSourceKind, string> = {
  SEARCH_CONSOLE: "search-console",
  POST_METRICS: "post-metrics",
  SHOPIFY_ORDERS: "shopify-orders",
  META_ADS: "meta-ads",
};

/** The brand's API root the data routes hang off. */
export const brandApi = brandBase;
export const rangeQuery = (from: string, to: string) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

/** A focus within this long of the last load doesn't load again (switching windows back and forth). */
const FOCUS_FRESH_MS = 60_000;

/** Data screens don't poll: they load once and again when the window gets focus back, unless they loaded in the last minute. */
export function useReloadOnFocus(reload: () => void, state: { kind: string }) {
  const loadedAt = useRef(0);
  useEffect(() => {
    if (state.kind === "ready") loadedAt.current = Date.now();
  }, [state]);
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - loadedAt.current < FOCUS_FRESH_MS) return;
      reload();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reload]);
}

/** What a failed or stopped sync means and what to do, keyed by the server's fixed reason. */
export const REASON_TEXT: Record<DataSyncReason, string> = {
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

/**
 * The day the presets end on: yesterday in the brand's zone, or the source's `syncedThrough` when that is earlier.
 * Today is partial for Sales and missing for Ads (Meta syncs to yesterday) and Search (Google lags 2–3 days), so a
 * range ending today always pulled the totals down against the full previous period.
 */
export function presetEnd(today: string, syncedThrough?: string | null): string {
  const yesterday = addDays(today, -1);
  return syncedThrough && syncedThrough < yesterday ? syncedThrough : yesterday;
}

/** The `days` days ending on `end`, both counted; the server compares with the same number of days before. */
export const presetRange = (days: number, end: string): DateRange => ({ from: addDays(end, -(days - 1)), to: end });

/** The range in the URL when it is real, in order and at most 90 days; else the 28 days ending on `end`. */
export function readRange(params: URLSearchParams, end: string): DateRange {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const ok = DAY.test(from) && DAY.test(to) && !Number.isNaN(ms(from)) && !Number.isNaN(ms(to)) && from <= to && rangeDays({ from, to }) <= MAX_DAYS;
  return ok ? { from, to } : presetRange(DEFAULT_DAYS, end);
}

/** The same URL with this range in it, other parameters kept. */
export function withRange(href: string, r: DateRange): string {
  const url = new URL(href);
  url.searchParams.set("from", r.from);
  url.searchParams.set("to", r.to);
  return url.toString();
}

/** "+12%" / "−3%" against the previous period; null when there is nothing to compare with. */
export function change(now: number | null | undefined, before: number | null | undefined): string | null {
  if (now == null || before == null || before === 0) return null;
  const p = Math.round(((now - before) / Math.abs(before)) * 100);
  return `${p > 0 ? "+" : p < 0 ? "−" : ""}${Math.abs(p)}%`;
}
