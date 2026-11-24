"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";

/**
 * A thin bar along the top while the next page loads, so every link answers the click at once. It starts on a
 * click on a link to another page of this site (or a GET form, e.g. search), or on startNavigation() from code, and
 * finishes when the URL changes (or finishNavigation()). A page that never arrives (an error) is cut off after 15 s.
 */
type Nav = { state: "idle" | "loading" | "done"; href: string | null };
const IDLE: Nav = { state: "idle", href: null };
let nav = IDLE;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function set(next: Nav, ms?: number) {
  nav = next;
  clearTimeout(timer);
  timer = ms ? setTimeout(() => set(IDLE), ms) : undefined;
  listeners.forEach((l) => l());
}

/** Start the bar for a navigation made from code (router.push/refresh); `href` is where it goes, when known. */
export function startNavigation(href: string | null = null) {
  set({ state: "loading", href }, 15_000);
}
/** The new page is here: fill the bar, then hide it. */
export function finishNavigation() {
  if (nav.state === "loading") set({ state: "done", href: null }, 400);
}
export const currentNavigation = () => nav;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
/** Where a navigation in flight is going (path + query), or null: the sidebar marks it before the page arrives. */
export function usePendingHref() {
  // Same snapshot on the server: nothing starts a navigation there, so it is always idle.
  return useSyncExternalStore(subscribe, () => nav.href, () => nav.href);
}

/** Path + query of `url` when it is another page of this site than `here`, else null (other site, or only the #hash). */
export function navTarget(url: URL, here: URL): string | null {
  if (url.origin !== here.origin) return null;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url.pathname + url.search;
}

type Click = Pick<MouseEvent, "button" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey">;
type Anchor = { href: string; target: string; hasAttribute(name: string): boolean };
/** The page a plain left click on this link opens in this tab, or null (new tab, download, modifier key...). */
export function linkTarget(e: Click, a: Anchor | null, here: URL): string | null {
  if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return null;
  if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
  return navTarget(new URL(a.href, here), here);
}

export function NavProgress() {
  const path = usePathname();
  const query = useSearchParams().toString();
  const { state } = useSyncExternalStore(subscribe, currentNavigation, currentNavigation);

  useEffect(() => {
    // Bubble phase, without a defaultPrevented check: next/link prevents the default of every click it handles.
    // A click the unsaved-changes guard cancels stops propagating in the capture phase, so it never gets here.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.("a[href]") as HTMLAnchorElement | null;
      const href = linkTarget(e, a, new URL(location.href));
      if (href) startNavigation(href);
    };
    const onSubmit = (e: SubmitEvent) => {
      const form = e.target as HTMLFormElement;
      if (e.defaultPrevented || form.method !== "get") return;
      const url = new URL(form.action);
      url.search = new URLSearchParams(new FormData(form) as unknown as Record<string, string>).toString();
      const href = navTarget(url, new URL(location.href));
      if (href) startNavigation(href);
    };
    document.addEventListener("click", onClick);
    document.addEventListener("submit", onSubmit);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("submit", onSubmit);
    };
  }, []);

  useEffect(finishNavigation, [path, query]);

  return <div role="progressbar" aria-label="Loading page" aria-hidden={state === "idle"} data-state={state} className="nav-progress" />;
}
