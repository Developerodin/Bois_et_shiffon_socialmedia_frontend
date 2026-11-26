"use client";

import { useCallback, useState } from "react";
import { BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SyncedAt, useReloadWhenSynced } from "@/components/data/synced-at";
import { request } from "@/components/settings/api";
import { ListSkeleton, LoadError, useLoad } from "@/components/settings/shared";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSection } from "@/components/ui/page-section";
import { StatusBadge } from "@/components/ui/status-badge";
import { CHANNEL_LABEL } from "@/lib/post-labels";
import { brandApi, rangeQuery, useReloadOnFocus, type DateRange } from "@/lib/data-api";
import { DATA_SOURCE_SLUGS, type DataSourceDto, type PostInsightDto, type PostInsightsDto, type PostMetricsDto } from "@/shared";
import { dayDate } from "@/lib/time";

// ---- the tab ------------------------------------------------------------------------------------------------------

const COLUMNS: { key: keyof PostMetricsDto; label: string }[] = [
  { key: "reach", label: "Reach" },
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "saves", label: "Saves" },
];

/** Rows shown at first and added per "Show more posts". */
const PAGE = 50;

const count = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
/** Highest reach first; posts with no reach yet go last, newest first among them. */
const byReach = (a: PostInsightDto, b: PostInsightDto) =>
  (b.metrics?.reach ?? -1) - (a.metrics?.reach ?? -1) || b.publishedAt.localeCompare(a.publishedAt);

/**
 * Published posts in the range (brand-local "YYYY-MM-DD") and how each did. analytics.read; the shell hides it otherwise.
 * `source`: the POST_METRICS source from PerformanceTabs' data-sources load, undefined before the first sync.
 */
export function PostsTab({ workspaceId, brandId, range, source, onSourceChanged }: { workspaceId: string; brandId: string; range: DateRange; source: DataSourceDto | undefined; onSourceChanged: () => void }) {
  const base = brandApi(workspaceId, brandId);
  const { from, to } = range; // the parent makes a new range object each render; refetch on its days only
  const fetcher = useCallback(
    () => request<PostInsightsDto>(`${base}/insights/posts?${rangeQuery(from, to)}`).then((p) => [...p.posts].sort(byReach)),
    [base, from, to],
  );
  const { state, reload } = useLoad(fetcher);
  useReloadOnFocus(reload, state);
  useReloadWhenSynced([source], reload);
  const [shown, setShown] = useState(PAGE);

  if (state.kind === "loading") return <ListSkeleton label="Loading post results" />;
  if (state.kind === "forbidden") return <EmptyState icon={BarChart3} title="You can't see post results" description="Ask a workspace owner for access." />;
  if (state.kind === "error") return <LoadError message={state.message} onRetry={reload} />;

  const posts = state.data;
  if (!source && !posts.length) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No post results yet"
        description="Connect Instagram, Facebook or Threads in Connections and publish a post. Its results show here from the next day."
      />
    );
  }

  return (
    <PageSection
      id="posts"
      title="Posts"
      description="Each post's latest numbers, highest reach first."
      className="flex flex-col gap-3"
    >
      {source ? <SyncedAt source={source} syncUrl={`${base}/data-sources/${DATA_SOURCE_SLUGS.POST_METRICS}/sync`} onChanged={onSourceChanged} /> : null}
      {posts.length ? (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-5 py-2 font-medium">Post</th>
                <th scope="col" className="px-3 py-2 font-medium">Published</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} scope="col" className="px-3 py-2 text-right font-medium">{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {posts.slice(0, shown).map((p) => (
                <tr key={p.attemptId}>
                  <td className="max-w-72 px-5 py-2.5">
                    <p className="truncate font-medium">{p.title || "Untitled post"}</p>
                    <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                      {CHANNEL_LABEL[p.channel] ?? p.channel}
                      {p.final ? <StatusBadge tone="muted">Final</StatusBadge> : null}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">{dayDate(p.publishedAt)}</td>
                  {COLUMNS.map((c) => (
                    <td key={c.key} className="px-3 py-2.5 text-right tabular-nums">{count(p.metrics?.[c.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {posts.length > shown ? (
            <Button size="sm" variant="outline" className="mx-5 mt-3 print:hidden" onClick={() => setShown((n) => n + PAGE)}>
              Show more posts
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No posts were published in these dates.</p>
      )}
      <p className="text-xs text-muted-foreground">
        A dash means the channel doesn&rsquo;t report that number. Older Facebook photo posts have no results, and Instagram stories aren&rsquo;t measured.
      </p>
    </PageSection>
  );
}
