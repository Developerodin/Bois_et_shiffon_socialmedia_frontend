"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { okToDiscard, UnsavedGuardOff } from "@/components/context/unsaved";
import { reelHref } from "@/components/reels/href";
import { Card } from "@/components/ui/card";
import { ContentPanel, ContentView } from "@/components/workspace/content-panels";
import { cachedPost, knownName } from "@/components/workspace/known-name";
import { Peek } from "@/components/workspace/peek";
import { usePeek, type PeekItem } from "@/components/workspace/use-peek";
import { filterFromSearch, withFilter, type CalendarFilter } from "@/lib/calendar-filter";
import { recentKey, writeRecent } from "@/lib/recent";
import { agreedToDrop, navigate, parseViewParts, peekCrumb, peekKey, peekTitle, viewToSearch, type View } from "@/lib/workspace-view";

/**
 * The /calendar page's content calendar and its side peek, which opens a post (?post=) over the calendar, as /tasks does
 * with ?task= (TaskPeek). It renders the Overview's ContentPanel and ContentView; the Overview still opens /?post= links.
 * A post's draft and release forms can hold unsaved edits, so, as in TaskPeek, changing or closing the post asks first.
 * The calendar's filters live in the URL (cf_ params) so a filtered view can be shared or refreshed.
 */
export function CalendarBoard({ workspaceId, brandId, perms, userId, reelsOn }: { workspaceId: string; brandId: string; perms: string[]; userId: string; reelsOn: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  const rKey = recentKey(workspaceId, brandId, userId);
  const [shownId, setShownId] = useState<string | null>(null);
  // The open post as the URL effect last accepted it, and that URL (put back when the person stays on unsaved edits).
  const shownRef = useRef<string | null>(null);
  const accepted = useRef<string | null>(null);
  // Recent records a post once per opening, once its view has loaded it (a 404 or a mistyped link isn't history).
  const recorded = useRef<string | null>(null);

  const hrefFor = useCallback(
    (id: string | null) => {
      const v: View = id ? { kind: "content", id } : { kind: "home" };
      const s = viewToSearch(v, window.location.search, pathname);
      return s.startsWith("?") ? `${pathname}${s}` : s;
    },
    [pathname],
  );

  // Compared by post id, so a filter change (which rewrites the URL in place) never asks about unsaved edits.
  useEffect(() => {
    const raw = new URLSearchParams(query).get("post");
    const v = raw === null ? null : parseViewParts("post", raw);
    const next = v?.kind === "content" ? v.id : null;
    // A bad post link: drop it, so Back doesn't return to it.
    if (raw !== null && !next) return void navigate(router, hrefFor(null), pathname, "replace");
    // A brand or workspace switch took the post out of the URL after the person agreed to leave: don't ask again.
    const agreed = agreedToDrop(window.location.search || window.location.pathname);
    if (next !== shownRef.current) {
      if (!agreed && !okToDiscard()) return void navigate(router, accepted.current ?? hrefFor(shownRef.current), pathname, "replace");
      shownRef.current = next;
      recorded.current = null;
      setShownId(next);
    }
    accepted.current = `${pathname}${query ? `?${query}` : ""}`;
  }, [query, pathname, router, hrefFor]);

  const open = (id: string | null) => {
    if (id === shownRef.current) return;
    if (!okToDiscard()) return;
    // The view first, so the URL change that follows finds nothing to ask about.
    shownRef.current = id;
    recorded.current = null;
    setShownId(id);
    navigate(router, hrefFor(id), pathname);
  };

  const filter = useMemo(() => filterFromSearch(new URLSearchParams(query)), [query]);
  const changeFilter = useCallback(
    (f: CalendarFilter) => {
      const q = withFilter(window.location.search, f);
      navigate(router, q ? `${pathname}?${q}` : pathname, pathname, "replace");
    },
    [router, pathname],
  );

  const view: View | null = shownId ? { kind: "content", id: shownId } : null;
  const post = shownId ? cachedPost(base, shownId) : undefined;
  const item: PeekItem | null = view
    ? { view, title: peekTitle(view, knownName(view, { docs: null, agents: null, base })), crumb: peekCrumb(view), fullPageHref: post?.studio && reelsOn ? reelHref(post.id, brandId) : undefined }
    : null;
  const peek = usePeek(item);
  // The post the peek shows: the open one, or the closed one while it slides out.
  const peekPost = peek.shown?.view.kind === "content" ? peek.shown.view : null;
  const onLoaded = (id: string) => {
    if (rKey && recorded.current !== id) writeRecent(rKey, { kind: "post", id, at: Date.now() });
    recorded.current = id;
  };

  return (
    <>
      {/* No overflow clip: the month view's day popover opens below its cell and may run past the card's bottom. */}
      <Card className="min-w-0">
        {/* The Planner runs from the Overview's agent peek; this page hosts posts only. */}
        <ContentPanel base={base} perms={perms} me={userId} filter={filter} onFilter={changeFilter} onOpen={(id) => open(id)} onRunPlanner={() => okToDiscard() && router.push("/?agent=planner")} />
      </Card>
      {peek.shown && peekPost && (
        <Peek placement="page" open={peek.live} title={peek.shown.title} crumb={peek.shown.crumb} fullPageHref={peek.shown.fullPageHref} onClose={() => open(null)} onExited={peek.onExited} asideRef={peek.ref}>
          {/* While it slides out, the closed post's editors no longer count as unsaved: the person already agreed. */}
          <UnsavedGuardOff value={!peek.live}>
            {/* Keyed by post: a replaced post remounts fresh, never carrying one post's edits into another. */}
            <ContentView key={peekKey(peekPost)} base={base} perms={perms} id={peekPost.id} reelsOn={reelsOn} brandId={brandId} onLoaded={() => onLoaded(peekPost.id)} />
          </UnsavedGuardOff>
        </Peek>
      )}
    </>
  );
}
