"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { UnsavedGuardOff } from "@/components/context/unsaved";
import { reelHref } from "@/components/reels/href";
import { useChannelConnections } from "@/components/social/channel-connection";
import { Card } from "@/components/ui/card";
import { ContentPanel, ContentView } from "@/components/workspace/content-panels";
import { cachedPost, knownName } from "@/components/workspace/known-name";
import { Peek } from "@/components/workspace/peek";
import { useGuardedPeekParam } from "@/components/workspace/use-guarded-peek-param";
import { usePeek, type PeekItem } from "@/components/workspace/use-peek";
import { useWorkflowPeek, WorkflowPeekBody } from "@/components/workspace/workflow-peek";
import { filterFromSearch, withFilter, type CalendarFilter } from "@/lib/calendar-filter";
import { peekInset } from "@/lib/calendar-month";
import { recentKey } from "@/lib/recent";
import { namesItem, navigate, peekCrumb, peekKey, peekTitle, viewToSearch, type View, type WorkflowPeekView } from "@/lib/workspace-view";
import { CONNECTIONS_READ } from "@/shared";

/** The peek's width (px) on wide screens, for a post and for the workflow card's agents alike, so the calendar keeps its inset. */
const INSPECTOR_W = 440;
/**
 * The narrowest the calendar may get beside the inspector (px). Narrower than this (a smaller desktop) the inspector
 * slides over the calendar as a drawer instead of squeezing its seven columns.
 */
const CALENDAR_BESIDE_MIN = 720;

/**
 * The /calendar page's content calendar and its side peek, which opens a post (?post=) over the calendar, as /tasks does
 * with ?task= (TaskPeek), or what the workflow card opens: an agent (?agent=) or Scout's ideas (?peek=ideas). One item at
 * a time: opening one takes the other's param out (viewToSearch). It renders the Overview's ContentPanel and ContentView; the Overview still opens /?post= links.
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
  // For a channel calendar's connection state: read once, only by roles that may see connections (as /connections).
  const connections = useChannelConnections(workspaceId, brandId, CONNECTIONS_READ.some((k) => perms.includes(k)));
  const changeFilter = useCallback(
    (f: CalendarFilter) => {
      const q = withFilter(window.location.search, f);
      navigate(router, q ? `${pathname}?${q}` : pathname, pathname, "replace");
    },
    [router, pathname],
  );

  // The workflow card's agent or ideas, in the same peek. A post open (or still asking about its unsaved edits, which
  // the post hook does when the URL moves on) wins until the hook lets it go, so the two never show at once.
  const hrefFor = useCallback((v: View) => {
    const s = viewToSearch(v, window.location.search, pathname);
    return s.startsWith("?") ? `${pathname}${s}` : s;
  }, [pathname]);
  const show = (v: View) => navigate(router, hrefFor(v), pathname);
  const wf = useWorkflowPeek({ workspaceId, brandId, perms, query, go: show });
  // Any other item in the URL (or an agent this brand doesn't have) is taken out in place, so Back doesn't return to it.
  // A malformed ?post= is the post hook's to drop.
  const params = new URLSearchParams(query);
  const bad = !params.has("post") && ((!wf.view && namesItem(query)) || wf.bad);
  useEffect(() => {
    if (bad) navigate(router, hrefFor({ kind: "home" }), pathname, "replace");
  }, [bad, router, hrefFor, pathname]);

  const view: View | null = shownId ? { kind: "content", id: shownId } : null;
  const post = shownId ? cachedPost(base, shownId) : undefined;
  const item: PeekItem | null = view
    ? { view, title: peekTitle(view, knownName(view, { docs: null, agents: null, base })), crumb: peekCrumb(view), fullPageHref: post?.studio && reelsOn ? reelHref(post.id, brandId) : undefined }
    : params.has("post")
      ? null
      : wf.item;
  const peek = usePeek(item);
  // What the peek shows: the open item, or the closed one while it slides out.
  const shownView = peek.shown?.view;
  const peekPost = shownView?.kind === "content" ? shownView : null;
  // Only the workflow hook puts an agent or a panel in this peek, so either is one of its views.
  const peekWf = shownView?.kind === "agent" || shownView?.kind === "panel" ? (shownView as WorkflowPeekView) : null;
  // While a post is open the calendar gives up the width its peek covers (the peek is fixed to the window's right edge),
  // so the toolbar and Sunday stay in view beside it, unless that would leave it under CALENDAR_BESIDE_MIN: then the
  // peek is a drawer over it. Back to full width as it closes.
  const [inset, setInset] = useState(0);
  const aside = peek.ref;
  useEffect(() => {
    const el = aside.current;
    const main = document.getElementById("content");
    if (!peek.live || !el || !main) return setInset(0);
    const measure = () => {
      const m = main.getBoundingClientRect();
      setInset(peekInset(m.left, m.right, window.innerWidth - el.offsetWidth, CALENDAR_BESIDE_MIN));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    ro.observe(main);
    return () => ro.disconnect();
  }, [peek.live, aside]);
  return (
    <>
      {/* No overflow clip: the month view's day popover opens below its cell and may run past the card's bottom. */}
      {/* It fills the page's height (flex-1), so the month grid below can spread its weeks over the window. */}
      <Card className="flex min-w-0 flex-1 flex-col" style={inset ? { marginRight: inset } : undefined}>
        {/* Plan with agents (the toolbar's Generate with agents) starts the Planner's posts chain here. */}
        <ContentPanel base={base} perms={perms} me={userId} filter={filter} onFilter={changeFilter} onOpen={(id) => open(id)} selectedId={shownId} connections={connections} reelsOn={reelsOn} onOpenAgent={(key) => show({ kind: "agent", key })} onOpenIdeas={() => show({ kind: "panel", id: "ideas" })} />
      </Card>
      {/* One Peek for both kinds, so the inset above keeps observing the same element when a post replaces an agent. */}
      {peek.shown && (peekPost || peekWf) && (
        <Peek placement="page" fixedWidth={INSPECTOR_W} open={peek.live} title={peek.shown.title} crumb={peek.shown.crumb} fullPageHref={peek.shown.fullPageHref} onClose={() => (peekPost ? open(null) : show({ kind: "home" }))} onExited={peek.onExited} asideRef={peek.ref}>
          {peekPost ? (
            // While it slides out, the closed post's editors no longer count as unsaved: the person already agreed.
            <UnsavedGuardOff value={!peek.live}>
              {/* Keyed by post: a replaced post remounts fresh, never carrying one post's edits into another. */}
              <ContentView key={peekKey(peekPost)} base={base} perms={perms} id={peekPost.id} reelsOn={reelsOn} brandId={brandId} onLoaded={() => recordLoaded(peekPost.id)} />
            </UnsavedGuardOff>
          ) : (
            peekWf && (
              // Keyed by item: another agent remounts fresh. A post opens in this peek; the posts are this page.
              <Fragment key={peekKey(peekWf)}>
                <WorkflowPeekBody view={peekWf} live={peek.live} base={base} workspaceId={workspaceId} brandId={brandId} perms={perms} agents={wf.agents} autoRunKey={wf.autoRunKey} onRunScout={wf.runScout} onOpenPost={(id) => open(id)} onOpenPosts={() => show({ kind: "home" })} />
              </Fragment>
            )
          )}
        </Peek>
      )}
    </>
  );
}
