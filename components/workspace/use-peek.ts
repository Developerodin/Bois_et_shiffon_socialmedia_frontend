"use client";

import { useCallback, useEffect, useLayoutEffect, useReducer, useRef, useState } from "react";
import { peekKey, type View } from "@/lib/workspace-view";

export const PEEK_WIDTH = 560;
const WIDTH_KEY = "peek.width.v1";
/** The peek's width: 400 px up to the smaller of 1000 px and 75% of the viewport (the cap wins on a narrow one). */
export const clampPeekWidth = (w: number, viewport: number) => Math.round(Math.min(1000, viewport * 0.75, Math.max(400, Number.isFinite(w) ? w : PEEK_WIDTH)));

/**
 * The peek's width on wide screens, remembered per browser (read after mount, so the first render matches the server's).
 * `resize` clamps to the viewport and saves, unless `save` is false (mid-drag).
 * ponytail: clamped when set or read, not when the window shrinks later; the sheet's CSS caps it at 100% meanwhile.
 */
export function usePeekWidth() {
  const [width, setWidth] = useState(PEEK_WIDTH);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(WIDTH_KEY);
      if (saved) setWidth(clampPeekWidth(Number(saved), window.innerWidth));
    } catch {
      // storage blocked: the default width
    }
  }, []);
  const resize = useCallback((w: number, save = true) => {
    const next = clampPeekWidth(w, window.innerWidth);
    setWidth(next);
    if (!save) return;
    try {
      localStorage.setItem(WIDTH_KEY, String(next));
    } catch {
      // ignore
    }
  }, []);
  return [width, resize] as const;
}

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
      // From the Recent menu the focused element is a menu item that is about to unmount: the opener is the Recent button.
      const el = a.closest("[data-recent]") ? document.getElementById("recent-menu") : a;
      const panel = a.closest<HTMLElement>("[data-panel]")?.dataset.panel;
      opener.current = { el: el ?? a, head: panel ? "panel-head-" + panel : null };
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
      const back = o?.el.isConnected ? o.el : (o?.head ? document.getElementById(o.head) : null) ?? document.getElementById("layout-menu") ?? document.querySelector<HTMLElement>("[id^=panel-head-]");
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
