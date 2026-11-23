"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Table } from "@/components/admin/table";
import { Stat } from "@/components/data/shared";
import { SyncedAt } from "@/components/data/synced-at";
import { connectionsUrl, errorMessage, request, type Connection } from "@/components/settings/api";
import { ListSkeleton, LoadError, selectClass, useLoad } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { PageSection } from "@/components/ui/page-section";
import { cn } from "@/lib/utils";
import { brandApi, change, rangeQuery, useReloadOnFocus, type DateRange } from "@/lib/data-api";
import { DATA_SOURCE_SLUGS, type ChooseSearchSiteBody, type DataSourceDto, type SearchMetrics, type SearchPagesDto, type SearchSiteDto, type SearchSitesDto, type SearchSummaryDto } from "@/shared";

const num = (n: number) => n.toLocaleString();
const pct = (ctr: number | null) => (ctr == null ? "—" : `${(ctr * 100).toFixed(1)}%`);
const pos = (p: number | null) => (p == null ? "—" : p.toFixed(1));
const DAY = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (d: string) => DAY.format(new Date(`${d}T00:00:00Z`));

/**
 * Search Console for the brand's site: totals against the previous equal-length period, every day, and the top pages.
 * `source` undefined = no site picked yet. `canManage` (integrations.manage) gets the site picker.
 */
export function SearchTab({ workspaceId, brandId, range, source, canManage, onSourceChanged }: { workspaceId: string; brandId: string; range: DateRange; source: DataSourceDto | undefined; canManage: boolean; onSourceChanged: () => void }) {
  const base = brandApi(workspaceId, brandId);
  const [picking, setPicking] = useState(false);

  if (!source || picking) {
    return (
      <PageSection id="search-site" title="Search Console" description="Clicks and positions from Google Search, for one site.">
        {!canManage ? (
          <p className="text-sm text-muted-foreground">No site picked yet. Ask a workspace owner to pick the brand&apos;s site.</p>
        ) : picking ? (
          <SitePicker workspaceId={workspaceId} brandId={brandId} current={source?.label ?? undefined} onSaved={() => { setPicking(false); onSourceChanged(); }} onCancel={() => setPicking(false)} />
        ) : (
          // The picker asks Google for the sites, so it opens on a press, not on every visit to the tab.
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">No site picked yet.</p>
            <Button size="sm" onClick={() => setPicking(true)}>Choose site</Button>
          </div>
        )}
      </PageSection>
    );
  }
  return <SearchNumbers base={base} range={range} source={source} onChangeSite={canManage ? () => setPicking(true) : undefined} />;
}

function SearchNumbers({ base, range, source, onChangeSite }: { base: string; range: DateRange; source: DataSourceDto; onChangeSite?: () => void }) {
  const { from, to } = range; // the parent makes a new range object each render; refetch on its days only
  const fetcher = useCallback(
    () => Promise.all([request<SearchSummaryDto>(`${base}/search/summary?${rangeQuery(from, to)}`), request<SearchPagesDto>(`${base}/search/pages?${rangeQuery(from, to)}&sort=clicks`)]),
    [base, from, to],
  );
  const { state, reload } = useLoad(fetcher);
  useReloadOnFocus(reload, state);

  const header = (
    <div className="flex flex-col gap-1">
      <SyncedAt source={source} syncUrl={`${base}/data-sources/${DATA_SOURCE_SLUGS.SEARCH_CONSOLE}/sync`} />
      <p className="text-xs text-muted-foreground">
        {source.label ? `${source.label} · ` : ""}
        {source.reportsInZone ? "Google's days (Pacific time). " : ""}
        The last 2–3 days are still settling at Google.
        {onChangeSite ? (
          <>
            {" "}
            <button type="button" onClick={onChangeSite} className="font-medium underline underline-offset-2 print:hidden">Change site</button>
          </>
        ) : null}
      </p>
    </div>
  );

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading search numbers" />;
  else if (state.kind === "forbidden") body = <p className="text-sm text-muted-foreground">You can&apos;t see search numbers.</p>;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else {
    const [summary, pages] = state.data;
    body = !summary.days.length && !summary.totals.impressions ? (
      <p className="text-sm text-muted-foreground">No numbers for these days yet. The first sync reads the last 90 days and takes a few minutes.</p>
    ) : (
      <div className="flex flex-col gap-6">
        <Totals now={summary.totals} before={summary.previous} />
        <details className="text-sm" open>
          <summary className="cursor-pointer py-1 text-xs text-muted-foreground hover:text-foreground print:hidden">By day</summary>
          <div className="mt-2">
            <Table
              head={["Day", "Clicks", "Impressions", "CTR", "Position"]}
              numeric={[1, 2, 3, 4]}
              empty="No days in this range."
              rows={summary.days.map((d) => [dayLabel(d.day), num(d.clicks), num(d.impressions), pct(d.ctr), pos(d.position)])}
            />
          </div>
        </details>
        <TopPages base={base} range={range} first={pages} />
      </div>
    );
  }

  return (
    <PageSection id="search" title="Search" description={header} className="flex flex-col gap-4">
      {body}
    </PageSection>
  );
}

function Totals({ now, before }: { now: SearchMetrics; before: SearchMetrics }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-muted/40 px-4 py-3 sm:grid-cols-4">
      <Stat label="Clicks" value={num(now.clicks)} before={num(before.clicks)} delta={change(now.clicks, before.clicks)} />
      <Stat label="Impressions" value={num(now.impressions)} before={num(before.impressions)} delta={change(now.impressions, before.impressions)} />
      <Stat label="Click-through rate" value={pct(now.ctr)} before={pct(before.ctr)} />
      <Stat label="Average position (lower is better)" value={pos(now.position)} before={pos(before.position)} />
    </div>
  );
}

/** The first 50 pages by clicks, then more on asking. */
function TopPages({ base, range, first }: { base: string; range: DateRange; first: SearchPagesDto }) {
  const [more, setMore] = useState<{ for: SearchPagesDto; pages: SearchPagesDto["pages"]; next: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // A new first page (new range, a reload) drops what was added under the old one.
  const extra = more?.for === first ? more : null;
  const rows = [...first.pages, ...(extra?.pages ?? [])];
  const next = extra ? extra.next : first.nextCursor;

  const loadMore = async () => {
    if (!next) return;
    setBusy(true);
    setError("");
    try {
      const d = await request<SearchPagesDto>(`${base}/search/pages?${rangeQuery(range.from, range.to)}&sort=clicks&cursor=${encodeURIComponent(next)}`);
      setMore({ for: first, pages: [...(extra?.pages ?? []), ...d.pages], next: d.nextCursor });
    } catch (e) {
      setError(errorMessage(e, "Couldn't load more pages. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">Top pages</h3>
      <p className="text-xs text-muted-foreground">Google reports the top pages each day, so these add up to less than the site total.</p>
      <Table
        head={["Page", "Clicks", "Impressions", "CTR", "Position"]}
        numeric={[1, 2, 3, 4]}
        wide
        empty="No pages in this range."
        rows={rows.map((p) => [<span key="p" className="break-all">{p.page}</span>, num(p.clicks), num(p.impressions), pct(p.ctr), pos(p.position)])}
      />
      {next ? (
        <Button size="sm" variant="outline" className="self-start print:hidden" disabled={busy} onClick={() => void loadMore()}>
          {busy ? "Loading…" : "Show more pages"}
        </Button>
      ) : null}
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Owners pick the site from the Google account's verified sites; saving starts a 90-day backfill on the server. */
function SitePicker({ workspaceId, brandId, current, onSaved, onCancel }: { workspaceId: string; brandId: string; current?: string; onSaved: () => void; onCancel: () => void }) {
  const base = brandApi(workspaceId, brandId);
  const fetcher = useCallback(async () => {
    const { connections } = await request<{ connections: Connection[] }>(connectionsUrl(workspaceId, brandId));
    const google = connections.find((c) => c.provider === "GOOGLE" && c.status === "ACTIVE");
    if (!google) return { google: null, sites: [] as SearchSiteDto[] };
    const { sites } = await request<SearchSitesDto>(`${base}/google/sites?connectionId=${encodeURIComponent(google.id)}`);
    return { google, sites };
  }, [workspaceId, brandId, base]);
  const { state, reload } = useLoad(fetcher);
  const [site, setSite] = useState(current ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (state.kind === "loading") return <ListSkeleton label="Loading your sites" rows={1} />;
  if (state.kind === "forbidden") return <p className="text-sm text-muted-foreground">You can&apos;t pick the site.</p>;
  if (state.kind === "error") return <LoadError message={state.message} onRetry={reload} />;
  const { google, sites } = state.data;
  if (!google) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect Google first. <Link href="/connections" className="font-medium text-foreground underline underline-offset-2">Open Connections</Link>
      </p>
    );
  }
  if (!sites.length) return <p className="text-sm text-muted-foreground">This Google account has no verified sites in Search Console.</p>;

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await request<{ source: DataSourceDto }>(`${base}/data-sources/${DATA_SOURCE_SLUGS.SEARCH_CONSOLE}`, { method: "PUT", body: JSON.stringify({ connectionId: google.id, siteUrl: site } satisfies ChooseSearchSiteBody) });
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the site. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="search-site-pick" className="text-sm font-medium">Site</label>
      <div className="flex flex-wrap items-center gap-2">
        <select id="search-site-pick" className={cn(selectClass, "sm:w-auto sm:min-w-72")} value={site} onChange={(e) => setSite(e.target.value)}>
          <option value="" disabled>Pick a site</option>
          {sites.map((s) => <option key={s.siteUrl} value={s.siteUrl}>{s.siteUrl}</option>)}
        </select>
        <Button size="sm" disabled={busy || !site || site === current} onClick={() => void save()}>{busy ? "Saving…" : "Use this site"}</Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
      <p className="text-xs text-muted-foreground">The first sync reads the last 90 days. A new site starts fresh; the old site&apos;s numbers are kept.</p>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
