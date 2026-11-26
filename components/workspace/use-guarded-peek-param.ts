"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { okToDiscard } from "@/components/context/unsaved";
import { writeRecent } from "@/lib/recent";
import { agreedToDrop, navigate, parseViewParts, viewToSearch, type View } from "@/lib/workspace-view";

/** The URL params a page's own peek opens on, and the view kind each names. */
const KIND = { task: "task", post: "content" } as const;

/**
 * A page's side peek kept in its URL (?task= on the task pages, ?post= on /calendar). It follows the URL (Back and
 * Forward included), drops a malformed link with a replace so Back doesn't return to it, and asks about unsaved edits
 * before another item replaces the open one or it closes: staying puts the last accepted URL back. A brand or workspace
 * switch the person already agreed to (agreedToDrop) doesn't ask again. Other params, such as filters, change without
 * asking, since only the item's id is compared. `recordLoaded` writes the item to Recent once per opening, once its view
 * has loaded it, so a 404 or a mistyped link isn't history.
 */
export function useGuardedPeekParam(param: keyof typeof KIND, recentKey: string | null) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const [shownId, setShownId] = useState<string | null>(null);
  // The open item as the URL effect last accepted it, and that URL (put back when the person stays on unsaved edits).
  const shownRef = useRef<string | null>(null);
  const accepted = useRef<string | null>(null);
  // Recent records an item once per opening, not on every reload of its view.
  const recorded = useRef<string | null>(null);
  const kind = KIND[param];

  const hrefFor = useCallback(
    (id: string | null) => {
      const v: View = id ? ({ kind, id } as View) : { kind: "home" };
      const s = viewToSearch(v, window.location.search, pathname);
      return s.startsWith("?") ? `${pathname}${s}` : s;
    },
    [pathname, kind],
  );

  useEffect(() => {
    const raw = new URLSearchParams(query).get(param);
    const v = raw === null ? null : parseViewParts(param, raw);
    const next = v?.kind === kind && "id" in v ? v.id : null;
    if (raw !== null && !next) return void navigate(router, hrefFor(null), pathname, "replace");
    const agreed = agreedToDrop(window.location.search || window.location.pathname);
    if (next !== shownRef.current) {
      if (!agreed && !okToDiscard()) return void navigate(router, accepted.current ?? hrefFor(shownRef.current), pathname, "replace");
      shownRef.current = next;
      recorded.current = null;
      setShownId(next);
    }
    accepted.current = `${pathname}${query ? `?${query}` : ""}`;
  }, [query, pathname, router, hrefFor, param, kind]);

  /** Opens an item, or closes the peek with null, after asking about unsaved edits. */
  const open = (id: string | null) => {
    if (id === shownRef.current) return;
    if (!okToDiscard()) return;
    // The view first, so the URL change that follows finds nothing to ask about.
    shownRef.current = id;
    recorded.current = null;
    setShownId(id);
    navigate(router, hrefFor(id), pathname);
  };

  const recordLoaded = (id: string) => {
    if (recentKey && recorded.current !== id) writeRecent(recentKey, { kind: param, id, at: Date.now() });
    recorded.current = id;
  };

  return { shownId, open, recordLoaded };
}
