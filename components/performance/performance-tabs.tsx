"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { DateRangeFilter, rangeLabel } from "@/components/data/date-range";
import { AdsTab } from "@/components/performance/ads-tab";
import { PostsTab } from "@/components/performance/posts-tab";
import { SalesTab } from "@/components/performance/sales-tab";
import { SearchTab } from "@/components/performance/search-tab";
import { request } from "@/components/settings/api";
import { ListSkeleton, LoadError, useLoad } from "@/components/settings/shared";
import { PageHeader } from "@/components/ui/page-header";
import { brandApi, readRange, useReloadOnFocus, withRange, zoneToday, type DataSourcesResponse, type DateRange } from "@/lib/data-api";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

export type PerformanceTab = "reports" | "search" | "posts" | "sales" | "ads";
const LABEL: Record<PerformanceTab, string> = { reports: "SEO & GEO", search: "Search", posts: "Posts", sales: "Sales", ads: "Ads" };

/**
 * The Performance page with its tabs: the SEO & GEO reports first, then the data tabs the server page let through
 * (flag + read permission). The tab and the date range live in the URL (?tab, ?from&to; replace, not push) so a reload
 * or a shared link lands on the same view. Prints as the open tab alone (globals.css, data-print-root).
 */
export function PerformanceTabs({ workspaceId, brandId, brandName, tabs, initialTab, initialRange, canManage, reports }: {
  workspaceId: string;
  brandId: string;
  brandName: string | null;
  tabs: PerformanceTab[];
  initialTab?: string;
  /** ?from&to as they came; checked once the brand's "today" is known. */
  initialRange: { from?: string; to?: string };
  /** integrations.manage: the site picker and turning on orders. */
  canManage: boolean;
  reports: ReactNode;
}) {
  const [active, setActive] = useState<PerformanceTab>(tabs.find((t) => t === initialTab) ?? tabs[0]);
  const [picked, setPicked] = useState<DateRange | null>(null);
  const tabRefs = useRef<Partial<Record<PerformanceTab, HTMLButtonElement | null>>>({});
  const isData = active !== "reports";

  const base = brandApi(workspaceId, brandId);
  const fetcher = useCallback(() => request<DataSourcesResponse>(`${base}/data-sources`), [base]);
  const { state, reload } = useLoad(isData ? fetcher : null);
  useReloadOnFocus(reload, state);

  function select(tab: PerformanceTab) {
    setActive(tab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", tab);
    window.history.replaceState(window.history.state, "", url);
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
      const today = zoneToday(timeZone);
      const range = picked ?? readRange(new URLSearchParams({ from: initialRange.from ?? "", to: initialRange.to ?? "" }), today);
      const changeRange = (r: DateRange) => {
        setPicked(r);
        window.history.replaceState(window.history.state, "", withRange(window.location.href, r));
      };
      const source = (kind: string) => sources.find((s) => s.kind === kind);
      rangeLine = rangeLabel(range);
      filter = <DateRangeFilter range={range} today={today} onChange={changeRange} />;
      const props = { workspaceId, brandId, canManage, onSourceChanged: reload, range };
      panel =
        active === "search" ? <SearchTab {...props} source={source("SEARCH_CONSOLE")} />
        : active === "sales" ? <SalesTab {...props} source={source("SHOPIFY_ORDERS")} />
        : active === "posts" ? <PostsTab workspaceId={workspaceId} brandId={brandId} from={range.from} to={range.to} />
        : <AdsTab workspaceId={workspaceId} brandId={brandId} from={range.from} to={range.to} canManage={canManage} />;
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
                selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
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
