"use client";

import { useMemo } from "react";
import type { Shoot } from "@/shared";
import { JOB_INTERVALS, fetchShared, sharedAt, useJob } from "@/components/workspace/use-job";
import { createLinkCache, useRereadWhenStale } from "@/components/workspace/use-steady-links";
import { stale } from "@/lib/signed-links";
import { shootUrl, shootsUrl } from "./api";
import { keepLinks, runningBesides } from "./shoot";

// The list and the shoot page share one cache, so one shoot's images don't reload as the views poll.
const { steady, linksAt } = createLinkCache<Shoot>((s) => s.id, keepLinks);

const STOP_ON = [403, 404] as const;
const oneDone = (shoot: Shoot) => shoot.status !== "RUNNING" && !stale(linksAt([shoot]));

/**
 * The brand's photoshoots, newest first; polls while one is running, except `trackedId`: "This shoot" polls that one
 * and reads the list again when it ends (CurrentShoot). Only the first shot of each is signed, and no `downloadUrl`:
 * open a shoot for those.
 */
export function useShoots(w: string, b: string, trackedId: string | null = null) {
  const url = shootsUrl(w, b);
  const pick = useMemo(() => (d: never) => (d as { shoots: Shoot[] }).shoots.map((s) => steady(s, sharedAt(url))), [url]);
  const done = useMemo(() => (shoots: Shoot[]) => !runningBesides(shoots, trackedId) && !stale(linksAt(shoots)), [trackedId]);
  const { data, failed, slow, status, reload } = useJob(url, { pick, done, intervals: JOB_INTERVALS.photoshootList, stopOn: STOP_ON });
  useRereadWhenStale(data && data.length > 0 ? linksAt(data) : null, reload);
  return { data, failed, slow, status, reload };
}

/** How long after a failed list read readListAgain tries once more. */
export const LIST_RETRY_MS = 5000;

/**
 * Reads the brand's list again, and once more after LIST_RETRY_MS if that read fails. CurrentShoot uses it when its
 * shoot ends: the list doesn't poll for that shoot, so a lost read would leave its card RUNNING until links go stale.
 */
export function readListAgain(w: string, b: string) {
  const list = shootsUrl(w, b);
  void fetchShared(list, true).catch(() => {
    setTimeout(() => void fetchShared(list, true).catch(() => undefined), LIST_RETRY_MS);
  });
}

/**
 * One photoshoot, with download links; polls while it runs. A 403 or 404 stops polling (`status` says which).
 * `linksAt`: when the links in `data` were fetched (kept links can be older than the last read; 0 with no data).
 */
export function useShoot(w: string, b: string, id: string) {
  const url = shootUrl(w, b, id);
  const pick = useMemo(() => (d: never) => steady((d as { shoot: Shoot }).shoot, sharedAt(url)), [url]);
  const { data, failed, slow, status, reload } = useJob(url, { pick, done: oneDone, intervals: JOB_INTERVALS.photoshoot, stopOn: STOP_ON });
  const one = useMemo(() => (data ? [data] : null), [data]);
  useRereadWhenStale(one ? linksAt(one) : null, reload);
  return { data, failed, slow, status, reload, linksAt: one ? linksAt(one) : 0 };
}
