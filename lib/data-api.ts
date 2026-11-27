// The Performance data tabs' routes and shared helpers. The DTOs are in @/shared (data-sources.ts).

import { useEffect, useRef } from "react";
import { SEARCH_RANGE_MAX_DAYS, type DateRange } from "@/shared";
import { brandBase } from "@/lib/tasks-api";

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

// ---- Date range: brand-local YYYY-MM-DD days carried in ?from&to ----

export type { DateRange };
export const PRESETS = [7, 28, 90] as const;
export const DEFAULT_DAYS = 28;

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

/**
 * The range the Performance page opens on with no ?from&to (performance-tabs: readRange's fallback on presetEnd), for
 * callers that link to it without the tab's state: the DEFAULT_DAYS days ending yesterday in the brand's zone, or on
 * `syncedThrough` when that is earlier.
 */
export const defaultRange = (timeZone: string | null | undefined, syncedThrough?: string | null, now = new Date()): DateRange =>
  presetRange(DEFAULT_DAYS, presetEnd(zoneToday(timeZone, now), syncedThrough));

/** The range in the URL when it is real, in order and at most 90 days; else the 28 days ending on `end`. */
export function readRange(params: URLSearchParams, end: string): DateRange {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const ok = DAY.test(from) && DAY.test(to) && !Number.isNaN(ms(from)) && !Number.isNaN(ms(to)) && from <= to && rangeDays({ from, to }) <= SEARCH_RANGE_MAX_DAYS;
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
