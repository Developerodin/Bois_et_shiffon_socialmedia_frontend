"use client";

import { useCallback, useState, type ReactNode } from "react";
import Link from "next/link";
import { Table } from "@/components/admin/table";
import { DateRangeFilter } from "@/components/data/date-range";
import { Stat } from "@/components/data/shared";
import { request } from "@/components/settings/api";
import { ListSkeleton, LoadError, useLoad } from "@/components/settings/shared";
import { PageSection } from "@/components/ui/page-section";
import { brandApi, change, rangeQuery, type DateRange } from "@/lib/data-api";
import type { SearchMetrics, UrlHistoryDto } from "@/shared";

const num = (n: number) => n.toLocaleString();
const pct = (ctr: number | null) => (ctr == null ? "—" : `${(ctr * 100).toFixed(1)}%`);
const pos = (p: number | null) => (p == null ? "—" : p.toFixed(1));
const DAY = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) => DAY.format(new Date(`${d.slice(0, 10)}T00:00:00Z`));
const STATUS: Record<string, string> = { TODO: "To do", IN_PROGRESS: "In progress", IN_REVIEW: "In review", DONE: "Done", CANCELLED: "Cancelled" };

/**
 * One page's SEO story: its search numbers over a range, the audit findings that listed it, its tasks and its
 * articles. The server rebuilds the URL it shows (`data.url`), so only that reaches an href.
 */
export function UrlHistory({ workspaceId, brandId, url, canOpenTasks }: { workspaceId: string; brandId: string; url: string; canOpenTasks: boolean }) {
  const base = brandApi(workspaceId, brandId);
  const [range, setRange] = useState<DateRange | null>(null);
  const [end, setEnd] = useState<string | null>(null);
  const fetcher = useCallback(async () => {
    const d = await request<UrlHistoryDto>(`${base}/seo/url?u=${encodeURIComponent(url)}${range ? `&${rangeQuery(range.from, range.to)}` : ""}`);
    // The server's default range ends at the last synced day: the presets end there too.
    setEnd((e) => e ?? d.range.to);
    return d;
  }, [base, url, range]);
  const { state, reload } = useLoad(url ? fetcher : null);

  if (!url) return <Shell><p className="text-sm text-muted-foreground">No page given. Open one from the Search tab or a finding.</p></Shell>;
  if (state.kind === "loading") return <Shell><ListSkeleton label="Loading the page's history" /></Shell>;
  if (state.kind === "forbidden") return <Shell><p className="text-sm text-muted-foreground">You can&apos;t see search numbers.</p></Shell>;
  if (state.kind === "error") return <Shell><LoadError message={state.message} onRetry={reload} /></Shell>;
  const d = state.data;

  return (
    <Shell
      title={<span className="break-all">{d.url}</span>}
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <a href={d.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium underline underline-offset-2">Open page</a>
          {end ? <DateRangeFilter range={d.range} end={end} onChange={setRange} /> : null}
        </div>
      }
    >
      <PageSection id="url-search" title="Search" description="Google's days (Pacific time), all spellings of this address together.">
        {d.search ? <Search search={d.search} /> : <p className="text-sm text-muted-foreground">Search Console isn&apos;t connected.</p>}
      </PageSection>
      <PageSection id="url-alerts" title="Search traffic alerts" description="Times this page lost clicks or position in Google in the last year.">
        {/* A server from before alerts sends none: a missing list reads as empty. */}
        {d.alerts?.length ? (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {d.alerts.map((a) => (
              <li key={a.id} className="flex flex-col gap-0.5 py-2">
                <span>{a.text}</span>
                <span className="text-xs text-muted-foreground">
                  {dayLabel(a.firstDay)}{a.lastDay !== a.firstDay ? ` to ${dayLabel(a.lastDay)}` : ""}{a.open ? " · still losing" : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No drop in search traffic found for this page.</p>
        )}
      </PageSection>
      <PageSection id="url-findings" title="Findings" description="Audit findings that listed this page in the last year.">
        {d.findings.length ? (
          <ul className="flex flex-col divide-y divide-border text-sm">
            {d.findings.map((f) => (
              <li key={`${f.kind}:${f.findingId}:${f.title}`} className="flex flex-col gap-0.5 py-2">
                <span className="font-medium">{f.title}</span>
                <span className="text-xs text-muted-foreground">
                  {f.kind} · {f.severity} · raised {dayLabel(f.firstSeen)}
                  {f.open ? " · still open" : f.clearedOn ? ` · cleared ${dayLabel(f.clearedOn)}` : ` · last seen ${dayLabel(f.lastSeen)}`}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No audit has flagged this page.</p>
        )}
      </PageSection>
      {d.tasks ? (
        <PageSection id="url-tasks" title="Tasks" description="Tasks naming this page, newest first.">
          {d.tasks.length ? (
            <ul className="flex flex-col divide-y divide-border text-sm">
              {d.tasks.map((t) => (
                <li key={t.id} className="flex flex-col gap-0.5 py-2">
                  {canOpenTasks ? (
                    <Link href={`/tasks?task=${encodeURIComponent(t.id)}`} className="font-medium underline-offset-2 hover:underline">{t.title}</Link>
                  ) : (
                    <span className="font-medium">{t.title}</span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    {[
                      STATUS[t.status] ?? t.status,
                      t.changeKind ? `Website change: ${t.changeKind.toLowerCase().replace(/_/g, " ")}` : null,
                      t.checkedLiveAt ? `checked live ${dayLabel(t.checkedLiveAt)}` : null,
                      t.recheckOn ? `re-check ${dayLabel(t.recheckOn)}` : null,
                      t.findingClearedAt ? `finding cleared ${dayLabel(t.findingClearedAt)}` : null,
                    ].filter(Boolean).join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No task names this page.</p>
          )}
        </PageSection>
      ) : null}
      <PageSection id="url-articles" title="Articles" description="The published article at this address, and articles written for its tasks.">
        {d.articles.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {d.articles.map((a) => (
              <li key={a.id}>
                <span className="font-medium">{a.title}</span>
                <span className="text-xs text-muted-foreground"> · {a.status.toLowerCase().replace(/_/g, " ")}{a.publishedAt ? ` ${dayLabel(a.publishedAt)}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No article is linked to this page.</p>
        )}
      </PageSection>
    </Shell>
  );
}

function Shell({ title, actions, children }: { title?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/performance?tab=search" className="text-xs text-muted-foreground underline-offset-2 hover:underline">← Search</Link>
        <h1 className="font-display text-xl font-medium">{title ?? "Page history"}</h1>
        {actions}
      </div>
      {children}
    </div>
  );
}

function Search({ search }: { search: NonNullable<UrlHistoryDto["search"]> }) {
  const t: SearchMetrics = search.totals;
  const b: SearchMetrics = search.previous;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-muted/40 px-4 py-3 sm:grid-cols-4">
        <Stat label="Clicks" value={num(t.clicks)} before={num(b.clicks)} delta={change(t.clicks, b.clicks)} />
        <Stat label="Impressions" value={num(t.impressions)} before={num(b.impressions)} delta={change(t.impressions, b.impressions)} />
        <Stat label="Click-through rate" value={pct(t.ctr)} before={pct(b.ctr)} />
        <Stat label="Average position (lower is better)" value={pos(t.position)} before={pos(b.position)} />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer py-1 text-xs text-muted-foreground hover:text-foreground">By day</summary>
        <div className="mt-2">
          <Table
            head={["Day", "Clicks", "Impressions", "CTR", "Position"]}
            numeric={[1, 2, 3, 4]}
            empty="Google reported no clicks or impressions for this page in this range."
            rows={search.days.map((x) => [dayLabel(x.day), num(x.clicks), num(x.impressions), pct(x.ctr), pos(x.position)])}
          />
        </div>
      </details>
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Top queries for this page</h3>
        <p className="text-xs text-muted-foreground">From the top 500 query–page pairs a day; Google also hides rare searches for privacy.</p>
        <Table
          head={["Query", "Clicks", "Impressions", "CTR", "Position"]}
          numeric={[1, 2, 3, 4]}
          wide
          empty="No queries for this page in this range."
          rows={search.topQueries.map((q) => [<span key="q" className="break-words">{q.query}</span>, num(q.clicks), num(q.impressions), pct(q.ctr), pos(q.position)])}
        />
      </div>
    </div>
  );
}
