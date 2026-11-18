"use client";

import { useEffect } from "react";
import { SIGNED_LINK_STALE_MS, linksFetchedAt } from "@/lib/signed-links";

/**
 * The links each item is shown with and when they were fetched, shared by a list and its detail page so one item's
 * images don't reload as the views poll. Ceiling: one entry per item seen in this tab, never evicted.
 * `keep` is the type's keepLinks: `prev`'s links while they are fresh.
 */
export function createLinkCache<T>(idOf: (x: T) => string, keep: (prev: T | undefined, next: T, prevAt: number) => T) {
  const shown = new Map<string, { item: T; at: number }>();
  return {
    /** `next` with the links already shown for it while those are fresh; records what is shown now. */
    steady(next: T, fetchedAt: number): T {
      const id = idOf(next);
      const prev = shown.get(id);
      const item = keep(prev?.item, next, prev?.at ?? 0);
      shown.set(id, { item, at: linksFetchedAt(prev?.at, fetchedAt) });
      return item;
    },
    /** When the oldest links among `items` were fetched (now for none). */
    linksAt: (items: readonly T[]): number => Math.min(Date.now(), ...items.map((x) => shown.get(idOf(x))?.at ?? 0)),
  };
}

/**
 * `done` only runs on render, so a page nobody touches would keep links past their hour: read again when the
 * oldest shown links (`oldestAt`, null for none) turn stale.
 */
export function useRereadWhenStale(oldestAt: number | null, reload: () => Promise<void>) {
  useEffect(() => {
    if (oldestAt === null) return;
    const t = setTimeout(() => void reload(), Math.max(0, oldestAt + SIGNED_LINK_STALE_MS - Date.now()));
    return () => clearTimeout(t);
  }, [oldestAt, reload]);
}
