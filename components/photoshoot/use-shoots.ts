"use client";

import { useEffect, useMemo } from "react";
import type { Shoot } from "@/shared";
import { JOB_INTERVALS, SIGNED_LINK_STALE_MS, sharedAt, stale, useJob } from "@/components/workspace/use-job";
import { shootUrl, shootsUrl } from "./api";
import { keepLinks } from "./shoot";

// The links each shoot is shown with and when they were fetched, shared by the list and the shoot page so one shoot's
// images don't reload as the views poll. Ceiling: one entry per shoot seen in this tab, never evicted.
const shown = new Map<string, { shoot: Shoot; at: number }>();

/** `next` with the links already shown for it while those are fresh; records what is shown now. */
function steady(next: Shoot, fetchedAt: number): Shoot {
  const prev = shown.get(next.id);
  const shoot = keepLinks(prev?.shoot, next, prev?.at ?? 0);
  // Kept links are as old as the earlier answer; new ones as old as this answer.
  shown.set(next.id, { shoot, at: prev && !stale(prev.at) ? prev.at : fetchedAt });
  return shoot;
}

/** When the oldest links among `shoots` were fetched (now for none). */
const linksAt = (shoots: readonly Shoot[]) => Math.min(Date.now(), ...shoots.map((s) => shown.get(s.id)?.at ?? 0));

const STOP_ON = [403, 404] as const;
const listDone = (shoots: Shoot[]) => !shoots.some((s) => s.status === "RUNNING") && !stale(linksAt(shoots));
const oneDone = (shoot: Shoot) => shoot.status !== "RUNNING" && !stale(linksAt([shoot]));

/**
 * `done` only runs on render, so a page nobody touches would keep links past their hour: read again when the
 * oldest shown links turn stale.
 */
function useRereadWhenStale(shoots: readonly Shoot[] | null, reload: () => Promise<void>) {
  useEffect(() => {
    if (!shoots || shoots.length === 0) return;
    const t = setTimeout(() => void reload(), Math.max(0, linksAt(shoots) + SIGNED_LINK_STALE_MS - Date.now()));
    return () => clearTimeout(t);
  }, [shoots, reload]);
}

/** The brand's photoshoots, newest first; polls while one is running. No `downloadUrl` here: open a shoot for that. */
export function useShoots(w: string, b: string) {
  const url = shootsUrl(w, b);
  const pick = useMemo(() => (d: never) => (d as { shoots: Shoot[] }).shoots.map((s) => steady(s, sharedAt(url))), [url]);
  const { data, failed, slow, status, reload } = useJob(url, { pick, done: listDone, intervals: JOB_INTERVALS.photoshootList, stopOn: STOP_ON });
  useRereadWhenStale(data, reload);
  return { data, failed, slow, status, reload };
}

/** One photoshoot, with download links; polls while it runs. A 403 or 404 stops polling (`status` says which). */
export function useShoot(w: string, b: string, id: string) {
  const url = shootUrl(w, b, id);
  const pick = useMemo(() => (d: never) => steady((d as { shoot: Shoot }).shoot, sharedAt(url)), [url]);
  const { data, failed, slow, status, reload } = useJob(url, { pick, done: oneDone, intervals: JOB_INTERVALS.photoshoot, stopOn: STOP_ON });
  const one = useMemo(() => (data ? [data] : null), [data]);
  useRereadWhenStale(one, reload);
  return { data, failed, slow, status, reload };
}
