"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { DateRangeFilter, rangeLabel } from "@/components/data/date-range";
import { AdsTab } from "@/components/performance/ads-tab";
import { PostsTab } from "@/components/performance/posts-tab";
import { SalesTab } from "@/components/performance/sales-tab";
import { SearchTab } from "@/components/performance/search-tab";
import { request } from "@/components/settings/api";
import { ListSkeleton, LoadError, useLoad } from "@/components/settings/shared";
import { PageHeader } from "@/components/ui/page-header";
import { brandApi, PRESETS, presetEnd, presetRange, rangeDays, readRange, useReloadOnFocus, withRange, zoneToday, type DateRange } from "@/lib/data-api";
import type { DataSourcesDto } from "@/shared";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

export type PerformanceTab = "reports" | "search" | "posts" | "sales" | "ads";
/** How often the sources are read again while a run is queued or running. */
const POLL_MS = 5_000;
/** The same while only history windows (backfill runs, ~50 in a chain lasting up to an hour) are queued or running. */
const BACKFILL_POLL_MS = 60_000;

/**
 * How often to read the sources again: null when nothing is queued or running; every minute when every run in hand
 * is a history window (so a 30–45 min chain costs ~one read a minute, not twelve); 5 s as soon as another run shows.
 */
export function pollEvery(sources: DataSourcesDto["sources"]): number | null {
  const runs = sources.flatMap((s) => (s.sync ? [s.sync] : []));
  if (!runs.length) return null;
  return runs.every((r) => r.backfill) ? BACKFILL_POLL_MS : POLL_MS;
}
const LABEL: Record<PerformanceTab, string> = { reports: "SEO & GEO", search: "Search", posts: "Posts", sales: "Sales", ads: "Ads" };

/**
 * The Growth reports page (/performance) with its tabs: the SEO & GEO reports first, then the data tabs the server
 * page let through (flag + read permission). The tab and the date range live in the URL (?tab, ?from&to; replace, not
 * push) so a reload or a shared link lands on the same view. Prints as the open tab alone (globals.css, data-print-root).
 */
export function PerformanceTabs({ workspaceId, brandId, brandName, tabs, initialRange, canManage, canSetBudgets, canMakeTasks, canWriteArticles, reports }: {
  workspaceId: string;
  brandId: string;
  brandName: string | null;
  tabs: PerformanceTab[];
  /** ?from&to as they came; checked once the brand's "today" is known. */
  initialRange: { from?: string; to?: string };
  /** integrations.manage: the site picker and turning on orders. */
  canManage: boolean;
  /** commercial.manage: set ad budgets (the server also needs ads.read, which the Ads tab already does). */
  canSetBudgets: boolean;
  /** The `tasks` flag and tasks.manage: "Make a task" on a declining page. */
  canMakeTasks: boolean;
  /** The `blog` flag and content.create: "Write an article" after a content brief. */
  canWriteArticles: boolean;
  reports: ReactNode;
}) {
  // The tab is read from the URL, so a link to another ?tab= (the sidebar's agents) switches it on this page too.
  const urlTab = useSearchParams().get("tab");
  const active = tabs.find((t) => t === urlTab) ?? tabs[0];
  /** A preset's length once one is pressed (each tab ends it on its own presetEnd), or the custom days as chosen. */
  const [picked, setPicked] = useState<number | DateRange | null>(null);
  const tabRefs = useRef<Partial<Record<PerformanceTab, HTMLButtonElement | null>>>({});
  const isData = active !== "reports";

  const base = brandApi(workspaceId, brandId);
  const fetcher = useCallback(() => request<DataSourcesDto>(`${base}/data-sources`), [base]);
  const { state, reload, poll } = useLoad(isData ? fetcher : null);
  useReloadOnFocus(reload, state);

  // One poll for the page while any source has a run queued or running (two ad accounts syncing still read once),
  // skipped while the tab is hidden; the server's answer ends it. A failed poll keeps the numbers on screen (poll).
  const every = isData && state.kind === "ready" ? pollEvery(state.data.sources) : null;
  useEffect(() => {
    if (!every) return;
    const t = window.setInterval(() => {
      if (!document.hidden) poll();
    }, every);
    return () => window.clearInterval(t);
  }, [every, poll]);

  function select(tab: PerformanceTab) {
    // Native history, not router.push: Next syncs useSearchParams from it without a server round trip.
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    // null, not window.history.state: Next ignores a call that carries its own state, so useSearchParams wouldn't move.
    window.history.replaceState(null, "", url);
  }
  function onTabKey(e: React.KeyboardEvent, index: number) {
    const delta = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    let next = index + delta;
    if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else if (!delta) return;
    e.preventDefault();
    const tab = tabs[(next + tabs.length) % tabs.length];
    select(tab);
    tabRefs.current[tab]?.focus();
  }

  let panel: ReactNode = reports;
  let rangeLine: string | null = null;
  let filter: ReactNode = null;
  if (isData) {
    if (state.kind === "loading") panel = <ListSkeleton label="Loading" />;
    else if (state.kind === "forbidden") panel = <p className="text-sm text-muted-foreground">You can&apos;t see these numbers. Ask a workspace owner for access.</p>;
    else if (state.kind === "error") panel = <LoadError message={state.message} onRetry={reload} />;
    else {
      const { sources, timeZone } = state.data;
      const source = (kind: string) => sources.find((s) => s.kind === kind);
      const end = presetEnd(zoneToday(timeZone), active === "search" ? source("SEARCH_CONSOLE")?.syncedThrough : null);
      const range = typeof picked === "number" ? presetRange(picked, end) : picked ?? readRange(new URLSearchParams({ from: initialRange.from ?? "", to: initialRange.to ?? "" }), end);
      const changeRange = (r: DateRange) => {
        const days = rangeDays(r);
        setPicked(r.to === end && PRESETS.some((n) => n === days) ? days : r);
        window.history.replaceState(null, "", withRange(window.location.href, r));
      };
      rangeLine = rangeLabel(range);
      filter = <DateRangeFilter range={range} end={end} onChange={changeRange} />;
      const props = { workspaceId, brandId, canManage, onSourceChanged: reload, range };
      panel =
        active === "search" ? <SearchTab {...props} source={source("SEARCH_CONSOLE")} canMakeTasks={canMakeTasks} canWriteArticles={canWriteArticles} />
        : active === "sales" ? <SalesTab {...props} source={source("SHOPIFY_ORDERS")} />
        : active === "posts" ? <PostsTab {...props} source={source("POST_METRICS")} />
        : <AdsTab {...props} canSetBudgets={canSetBudgets} sources={sources.filter((s) => s.kind === "META_ADS")} />;
    }
  }

  return (
    <div data-print-root className="mx-auto flex max-w-6xl flex-col gap-4">
      <PageHeader title={navFor("/performance").title}>
        How findable the brand is, in search engines and in AI assistants, and how its site, posts and shop are doing.
      </PageHeader>
      <p className="hidden text-sm print:block">
        {[brandName, LABEL[active], rangeLine].filter(Boolean).join(" · ")}
      </p>
      <div role="tablist" aria-label="Performance" className="flex max-w-full gap-1 self-start overflow-x-auto rounded-full border border-border bg-card p-1">
        {tabs.map((t, i) => {
          const selected = t === active;
          return (
            <button
              key={t}
              ref={(el) => {
                tabRefs.current[t] = el;
              }}
              role="tab"
              id={`performance-tab-${t}`}
              aria-selected={selected}
              aria-controls={`performance-panel-${t}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(t)}
              onKeyDown={(e) => onTabKey(e, i)}
              className={cn(
                "shrink-0 rounded-full px-4 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected ? "bg-accent ring-1 ring-inset ring-control text-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {LABEL[t]}
            </button>
          );
        })}
      </div>
      {filter ? <div className="print:hidden">{filter}</div> : null}
      <div role="tabpanel" id={`performance-panel-${active}`} aria-labelledby={`performance-tab-${active}`} tabIndex={0} className="rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-background">
        {panel}
      </div>
    </div>
  );
}
