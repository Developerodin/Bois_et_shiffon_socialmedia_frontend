"use client";

import { useCallback, useEffect } from "react";
import Link from "next/link";
import { BarChart3 } from "lucide-react";
import { request } from "@/components/settings/api";
import { ListSkeleton, LoadError, useLoad } from "@/components/settings/shared";
import { EmptyState } from "@/components/ui/empty-state";
import { PageSection } from "@/components/ui/page-section";
import { StatusBadge } from "@/components/ui/status-badge";
import { CHANNEL_LABEL } from "@/lib/post-labels";
import { brandBase } from "@/lib/tasks-api";
import { dayDate, timeAgo } from "@/lib/time";

// ---- mirror of server DTO — replace with synced type at merge ------------------------------------------------------
// shared/data-sources.ts (GET data-sources) and shared/api/insights.ts (GET insights/posts).

type DataSourceKind = "SEARCH_CONSOLE" | "POST_METRICS" | "SHOPIFY_ORDERS" | "META_ADS";
type DataSyncReason = "reconnect" | "permission" | "partial" | "failed" | "rate-limited";
export type DataSourceDto = {
  id: string;
  kind: DataSourceKind;
  label?: string | null;
  status: "ACTIVE" | "ERROR" | "OFF";
  lastResult: { at: string; okAt: string | null; reason: DataSyncReason | null; count: number; error: string | null } | null;
  syncedThrough: string | null;
  reportsInZone: string | null;
};

type PostMetricsDto = {
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saves: number | null;
  interactions: number | null;
};
/** One published post in the range, with its latest snapshot (null before the first read). */
type PostWithMetricsDto = {
  attemptId: string;
  contentItemId: string;
  title: string | null;
  /** ContentChannel, e.g. INSTAGRAM_POST */
  channel: string;
  publishedAt: string;
  metrics: PostMetricsDto | null;
  readAt: string | null;
  /** Past day 30: these numbers won't change again. */
  final: boolean;
};
type PostsInsightsDto = { posts: PostWithMetricsDto[] };

// ---- shared with ads-tab (move next to lib/data-api.ts at merge) ---------------------------------------------------

export const brandApi = brandBase;
export const rangeQuery = (from: string, to: string) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

/** Data screens don't poll: they load once and again when the window gets focus. */
export function useReloadOnFocus(reload: () => void) {
  useEffect(() => {
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, [reload]);
}

/**
 * A source's sync state above its numbers: what to do when it needs reconnecting or lacks a permission, the fixed
 * error text otherwise, and when it last synced. Nothing while it's healthy and has never synced.
 */
export function SourceNotice({ source, provider }: { source: DataSourceDto; provider: string }) {
  const last = source.lastResult;
  const updated = timeAgo(last?.okAt);
  const fix =
    last?.reason === "reconnect"
      ? `${provider} needs reconnecting before these numbers can update.`
      : last?.reason === "permission"
        ? `${provider} didn't grant access to these numbers. Reconnect it and allow access.`
        : null;
  if (fix) {
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm">
        <span>
          {fix}
          {updated ? <span className="text-muted-foreground"> Numbers below are from {updated}.</span> : null}
        </span>
        <Link href="/connections" className="font-medium text-primary underline-offset-4 hover:underline">
          Open Connections
        </Link>
      </div>
    );
  }
  if (!updated && !last?.error) return null;
  return (
    <p className="text-xs text-muted-foreground">
      {updated ? `Updated ${updated}.` : null}
      {last?.error ? ` ${last.error}` : null}
    </p>
  );
}

// ---- the tab ------------------------------------------------------------------------------------------------------

const COLUMNS: { key: keyof PostMetricsDto; label: string }[] = [
  { key: "reach", label: "Reach" },
  { key: "views", label: "Views" },
  { key: "likes", label: "Likes" },
  { key: "comments", label: "Comments" },
  { key: "shares", label: "Shares" },
  { key: "saves", label: "Saves" },
];

const count = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());
/** Highest reach first; posts with no reach yet go last, newest first among them. */
const byReach = (a: PostWithMetricsDto, b: PostWithMetricsDto) =>
  (b.metrics?.reach ?? -1) - (a.metrics?.reach ?? -1) || b.publishedAt.localeCompare(a.publishedAt);

/** Published posts in `from`..`to` (brand-local "YYYY-MM-DD") and how each did. analytics.read; the shell hides it otherwise. */
export function PostsTab({ workspaceId, brandId, from, to }: { workspaceId: string; brandId: string; from: string; to: string }) {
  const base = brandApi(workspaceId, brandId);
  const fetcher = useCallback(
    () =>
      Promise.all([
        request<{ sources: DataSourceDto[] }>(`${base}/data-sources`),
        request<PostsInsightsDto>(`${base}/insights/posts?${rangeQuery(from, to)}`),
      ]).then(([s, p]) => ({ source: s.sources.find((d) => d.kind === "POST_METRICS") ?? null, posts: [...p.posts].sort(byReach) })),
    [base, from, to],
  );
  const { state, reload } = useLoad(fetcher);
  useReloadOnFocus(reload);

  if (state.kind === "loading") return <ListSkeleton label="Loading post results" />;
  if (state.kind === "forbidden") return <EmptyState icon={BarChart3} title="You can't see post results" description="Ask a workspace owner for access." />;
  if (state.kind === "error") return <LoadError message={state.message} onRetry={reload} />;

  const { source, posts } = state.data;
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
      {source ? <SourceNotice source={source} provider="Instagram, Facebook or Threads" /> : null}
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
              {posts.map((p) => (
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
