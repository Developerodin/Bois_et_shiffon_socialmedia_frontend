"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, request } from "@/components/settings/api";

/** Poll steps: until `untilMs` into the running episode, poll every `everyMs`. The last step applies past every `untilMs`. */
export type Intervals = readonly (readonly [untilMs: number, everyMs: number])[];

export const JOB_INTERVALS = {
  always: [[Infinity, 6_000]],
  // The shell's "agent finished" watcher: slow, since the Overview and the post panels already poll the same URL faster.
  agentWatch: [[Infinity, 20_000]],
  reelOptions: [[120_000, 10_000], [600_000, 20_000], [Infinity, 60_000]],
  reelRender: [[120_000, 5_000], [600_000, 10_000], [Infinity, 30_000]],
  photoshoot: [[120_000, 5_000], [600_000, 10_000], [Infinity, 30_000]],
  photoshootList: [[Infinity, 10_000]],
  preview: [[Infinity, 10_000]],
  reelList: [[Infinity, 10_000]],
  storyRender: [[60_000, 3_000], [Infinity, 10_000]],
  // Publishing gives up after 10 minutes: the caller passes capMs: 600_000.
  publishing: [[Infinity, 5_000]],
} as const satisfies Record<string, Intervals>;

const MAX_DELAY_MS = 60_000;
// The server sends no Retry-After on a 429, so wait the longest delay.
const RATE_LIMITED_MS = 60_000;

/** How long to wait before the next poll: the step for the elapsed time, doubled per error in a row, at most a minute. */
export function nextDelay(intervals: Intervals, elapsedMs: number, errors: number, rateLimited: boolean): number {
  if (rateLimited) return RATE_LIMITED_MS;
  const step = intervals.find(([untilMs]) => elapsedMs < untilMs) ?? intervals[intervals.length - 1];
  return Math.min(step[1] * 2 ** errors, MAX_DELAY_MS);
}

// Last response per URL, shared by every panel on the page: a post opened from the calendar shows at once,
// and a fresh response (e.g. after an edit) updates every panel showing that URL, not just the one that asked.
const lastResponse = new Map<string, unknown>();
const fetchedAt = new Map<string, number>();
// How many times putShared answered a URL: a read that started before the latest one is older than it.
const puts = new Map<string, number>();
const inFlight = new Map<string, Promise<unknown>>();
const listeners = new Map<string, Set<(d: unknown) => void>>();

/**
 * GET `url`, joining the request already in flight for it if there is one. A success is stored and sent to every
 * subscriber; a failure rejects every waiter and leaves the last good response in place.
 * `fresh` (a reload after a change) never joins: it waits for the request in flight, then sends its own, so its answer
 * is from after the change. It becomes the request in flight, so there is still only one at a time per URL.
 */
export function fetchShared(url: string, fresh = false): Promise<unknown> {
  const pending = inFlight.get(url);
  if (pending && !fresh) return pending;
  const putsAtStart = puts.get(url) ?? 0;
  const p: Promise<unknown> = (pending ? pending.catch(() => undefined) : Promise.resolve())
    .then(() => request<unknown>(url))
    .then((d) => {
      // An edit's answer landed while this read was out: the read may predate it, so keep the edit's answer.
      if ((puts.get(url) ?? 0) !== putsAtStart) return lastResponse.get(url);
      lastResponse.set(url, d);
      fetchedAt.set(url, Date.now());
      listeners.get(url)?.forEach((fn) => fn(d));
      return d;
    })
    .finally(() => {
      if (inFlight.get(url) === p) inFlight.delete(url);
    });
  inFlight.set(url, p);
  return p;
}

export function sharedResponse(url: string): unknown | undefined {
  return lastResponse.get(url);
}

/** An answer the server gave for `url` another way (a PATCH that returns the new view): every subscriber shows it. */
export function putShared(url: string, d: unknown): void {
  puts.set(url, (puts.get(url) ?? 0) + 1);
  lastResponse.set(url, d);
  fetchedAt.set(url, Date.now());
  listeners.get(url)?.forEach((fn) => fn(d));
}

/** When `url` last got an answer (0: never). */
export const sharedAt = (url: string): number => fetchedAt.get(url) ?? 0;

export function subscribeShared(url: string, fn: (d: unknown) => void): () => void {
  const set = listeners.get(url) ?? new Set();
  listeners.set(url, set.add(fn));
  return () => void set.delete(fn);
}

const visible = () => document.visibilityState === "visible";

/**
 * Poll `url` until `done(data)` (forever without `done`), on the shared per-URL cache: panels on one URL share one
 * request. Backs off on errors, waits a minute when rate limited, pauses while the tab is hidden and fetches as soon
 * as it's visible. `slow` turns on once `capMs` has passed into the running episode without the job being done; polling goes on.
 * `pick`, `done`, `intervals` and `stopOn` must be stable (module-level or memoised), or every render restarts the polling.
 * `stopOn`: HTTP statuses that end polling (a 404 won't turn into a 200 by asking again); `failed` stays on until a
 * success, e.g. from `reload`. `status` is the last error's HTTP status (0: no answer; null: no error, or not an HTTP one).
 * A new `url` starts over: data from the cache (or none), no errors, the clock and `slow` reset.
 * `off`: don't fetch (e.g. the person's role can't read it); answers other panels get still arrive.
 */
export function useJob<T>(
  url: string,
  { pick, done, intervals, capMs, stopOn, off }: { pick: (d: never) => T; done?: (data: T) => boolean; intervals: Intervals; capMs?: number; stopOn?: readonly number[]; off?: boolean },
): { data: T | null; failed: boolean; slow: boolean; status: number | null; reload: () => Promise<void> } {
  const cached = () => {
    const d = sharedResponse(url);
    return d === undefined ? null : pick(d as never);
  };
  const [data, setData] = useState<T | null>(cached);
  const [failed, setFailed] = useState(false);
  const [slow, setSlow] = useState(false);
  const [status, setStatus] = useState<number | null>(null);
  // The URL `data`, `failed` and `slow` belong to: on a new URL, reset them before anything uses the old job's state.
  const [shownUrl, setShownUrl] = useState(url);
  if (shownUrl !== url) {
    setShownUrl(url);
    setData(cached());
    setFailed(false);
    setSlow(false);
    setStatus(null);
  }
  const startedAt = useRef(0);
  const errors = useRef(0);
  const rateLimited = useRef(false);
  const finished = data !== null && done !== undefined && done(data);
  const stopped = failed && status !== null && stopOn !== undefined && stopOn.includes(status);

  useEffect(() => {
    startedAt.current = Date.now();
    errors.current = 0;
    rateLimited.current = false;
  }, [url]);

  // A job that starts running again (a post going out after the panel sat idle) gets its own clock: its own cap and cadence.
  const wasFinished = useRef(finished);
  useEffect(() => {
    if (wasFinished.current && !finished) {
      startedAt.current = Date.now();
      setSlow(false);
    }
    wasFinished.current = finished;
  }, [finished]);

  const onError = useCallback((e: unknown) => {
    errors.current += 1;
    rateLimited.current = e instanceof ApiError && e.status === 429;
    setFailed(true);
    setStatus(e instanceof ApiError ? e.status : null);
  }, []);

  // Any success on this URL (ours or another panel's) brings the data and clears the error backoff.
  useEffect(() => {
    const off = subscribeShared(url, (d) => {
      setData(pick(d as never));
      setFailed(false);
      setStatus(null);
      errors.current = 0;
      rateLimited.current = false;
    });
    // A response that landed between render and this effect.
    const d = sharedResponse(url);
    if (d !== undefined) setData(pick(d as never));
    return off;
  }, [url, pick]);

  useEffect(() => {
    if (finished || stopped || off) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Each poll() starts a new chain; an older chain still awaiting its response doesn't schedule again.
    let chain = 0;
    const delay = () => nextDelay(intervals, Date.now() - startedAt.current, errors.current, rateLimited.current);
    const poll = (force: boolean) => {
      clearTimeout(timer);
      const mine = ++chain;
      const next = () => {
        if (alive && mine === chain && visible()) timer = setTimeout(tick, delay());
      };
      // Another panel fetched this URL moments ago: its response already reached us.
      if (!force && Date.now() - (fetchedAt.get(url) ?? 0) < delay() / 2) return next();
      // A StrictMode remount or a second panel joins the request in flight rather than sending another.
      void fetchShared(url)
        .then(undefined, (e) => alive && onError(e))
        .then(next);
    };
    const tick = () => visible() && poll(false);
    const onShow = () => visible() && poll(true);
    poll(false);
    document.addEventListener("visibilitychange", onShow);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [url, intervals, finished, stopped, off, onError]);

  useEffect(() => {
    if (finished || capMs === undefined) return;
    const t = setTimeout(() => setSlow(true), Math.max(0, startedAt.current + capMs - Date.now()));
    return () => clearTimeout(t);
  }, [url, finished, capMs]);

  const reload = useCallback(() => fetchShared(url, true).then(() => undefined, onError), [url, onError]);

  return { data, failed, slow: slow && !finished, status, reload };
}

/** Poll a brand API path every 6 s; `reload` refetches now. Starts from the last response any panel got. `on`: false doesn't fetch. */
export function useBrandData<T>(base: string, path: string, pick: (d: never) => T, on = true) {
  const { data, failed, reload } = useJob(`${base}/${path}`, { pick, intervals: JOB_INTERVALS.always, off: !on });
  return { data, failed, reload };
}
