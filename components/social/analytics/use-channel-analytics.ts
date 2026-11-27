"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiError, request } from "@/components/settings/api";
import { comparable, type Load } from "@/lib/analytics-channels";
import type { ChannelAnalyticsDto } from "@/shared";

// One read per account and range for the page's life: going back is instant (the server caches 15 minutes too).
const cache = new Map<string, Promise<ChannelAnalyticsDto>>();
function load(base: string, id: string, days: number) {
  const key = `${base}|${id}|${days}`;
  let p = cache.get(key);
  if (!p) {
    p = request<ChannelAnalyticsDto>(`${base}/insights/channel?channel=${id}&days=${days}`);
    // A failure isn't kept: the next look asks again.
    p.catch(() => cache.get(key) === p && cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/**
 * One channel's numbers over `days` (GET insights/channel), read only while `on` (a known missing connection isn't
 * asked about). The state belongs to its account and range: another one reads as loading at once, never the last
 * one's numbers for a moment.
 */
export function useChannelAnalytics(base: string, id: string, days: number, on: boolean): [Load, () => void] {
  const key = `${id}:${days}`;
  const [state, setState] = useState<{ key: string; load: Load }>({ key, load: { kind: "loading" } });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!on) return;
    let live = true;
    load(base, id, days).then(
      (data) => live && setState({ key, load: { kind: "ready", data } }),
      (e: unknown) => live && setState({ key, load: { kind: "error", message: e instanceof ApiError ? e.message : "Couldn't read these numbers. Try again." } }),
    );
    return () => {
      live = false;
    };
  }, [base, id, days, on, nonce, key]);
  // Try again asks afresh: a kept answer (even a partial one) would only come back the same.
  const retry = useCallback(() => {
    cache.delete(`${base}|${id}|${days}`);
    setState({ key, load: { kind: "loading" } });
    setNonce((x) => x + 1);
  }, [base, id, days, key]);
  return [state.key === key ? state.load : { kind: "loading" }, retry];
}

/**
 * The same account over twice the days, for the previous period's figures (lib/analytics-channels previousPeriod).
 * Asked only once the period's own read is in (`after`) and only for periods with room for it (7 and 14 days; the
 * 14-day one is the 28-day view's read, so it is often already kept). A failure just means no comparison.
 */
export function useWideRead(base: string, id: string, days: number, after: boolean): ChannelAnalyticsDto | null {
  const key = `${id}:${days}`;
  const [wide, setWide] = useState<{ key: string; data: ChannelAnalyticsDto } | null>(null);
  useEffect(() => {
    if (!after || !comparable(days)) return;
    let live = true;
    load(base, id, days * 2).then(
      (data) => live && setWide({ key, data }),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [base, id, days, after, key]);
  return wide?.key === key ? wide.data : null;
}
