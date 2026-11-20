"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef } from "react";
import { peekKey, type View } from "@/lib/workspace-view";

/** What the peek shows: the open item, its title and breadcrumb, and a full page when there is one (studio reels). */
export type PeekItem = { view: View; title: string; crumb: string; fullPageHref?: string };

// The slide is 200 ms; if transitionend never comes (a tab in the background, a cancelled transition), this clears it.
const EXIT_FALLBACK_MS = 300;

/**
 * The peek for `item` (null when nothing is open). After closing, the last item stays as `shown` until the slide out
 * ends, then unmounts; `live` is false meanwhile, so the caller renders that snapshot without auto-run. Focus moves into
 * the peek's title on open and back to what opened it on close.
 */
export function usePeek(item: PeekItem | null) {
  const ref = useRef<HTMLElement | null>(null);
  const last = useRef<PeekItem | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const live = item !== null;
  if (item) last.current = item;
  const liveNow = useRef(live);
  liveNow.current = live;

  const onExited = useCallback(() => {
    if (liveNow.current || !last.current) return;
    last.current = null;
    rerender();
  }, []);

  // The element that opened the peek and its panel's header, for giving focus back on close.
  const opener = useRef<{ el: HTMLElement; head: string | null } | null>(null);
  const key = item ? peekKey(item.view) : null;
  useEffect(() => {
    if (!key) return;
    const a = document.activeElement;
    // Opening another item from inside the peek keeps the first opener.
    if (a instanceof HTMLElement && a !== document.body && !ref.current?.contains(a)) {
      const panel = a.closest<HTMLElement>("[data-panel]")?.dataset.panel;
      opener.current = { el: a, head: panel ? "panel-head-" + panel : null };
    }
    ref.current?.querySelector<HTMLElement>("[data-peek-title]")?.focus({ preventScroll: true });
  }, [key]);

  const wasLive = useRef(live);
  // Layout effect: under reduced motion the snapshot is gone before the next paint.
  useLayoutEffect(() => {
    if (wasLive.current === live) return;
    wasLive.current = live;
    if (live) return;
    // Focus that already moved elsewhere on purpose (a sidebar link) stays there.
    const a = document.activeElement;
    if (!a || a === document.body || ref.current?.contains(a)) {
      const o = opener.current;
      const back = o?.el.isConnected ? o.el : (o?.head ? document.getElementById(o.head) : null) ?? document.getElementById("layout-menu");
      back?.focus();
    }
    opener.current = null;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onExited();
      return;
    }
    const t = setTimeout(onExited, EXIT_FALLBACK_MS);
    return () => clearTimeout(t);
  }, [live, onExited]);

  return { shown: item ?? last.current, live, ref, onExited };
}
