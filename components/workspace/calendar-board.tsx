"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { okToDiscard, UnsavedGuardOff } from "@/components/context/unsaved";
import { reelHref } from "@/components/reels/href";
import { Card } from "@/components/ui/card";
import { ContentPanel, ContentView } from "@/components/workspace/content-panels";
import { cachedPost, knownName } from "@/components/workspace/known-name";
import { Peek } from "@/components/workspace/peek";
import { useGuardedPeekParam } from "@/components/workspace/use-guarded-peek-param";
import { usePeek, type PeekItem } from "@/components/workspace/use-peek";
import { filterFromSearch, withFilter, type CalendarFilter } from "@/lib/calendar-filter";
import { recentKey } from "@/lib/recent";
import { navigate, peekCrumb, peekKey, peekTitle, type View } from "@/lib/workspace-view";

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
  // The open post follows ?post=, asking about unsaved edits before it changes or closes, as TaskPeek does with ?task=.
  const { shownId, open, recordLoaded } = useGuardedPeekParam("post", recentKey(workspaceId, brandId, userId));

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
            <ContentView key={peekKey(peekPost)} base={base} perms={perms} id={peekPost.id} reelsOn={reelsOn} brandId={brandId} onLoaded={() => recordLoaded(peekPost.id)} />
          </UnsavedGuardOff>
        </Peek>
      )}
    </>
  );
}
