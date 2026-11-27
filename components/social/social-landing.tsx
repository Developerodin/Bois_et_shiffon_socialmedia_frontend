"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Newspaper, type LucideIcon } from "lucide-react";
import { ApiError, settingsApi, type Connection } from "@/components/settings/api";
import { ListSkeleton } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { LoadFailed } from "@/components/ui/load-failed";
import { PageSection } from "@/components/ui/page-section";
import { StatusBadge } from "@/components/ui/status-badge";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { calendarHref } from "@/lib/calendar-filter";
import { channelIcon, STATUS_LABEL } from "@/lib/post-labels";
import { connectionLines, rowSummary, SOCIAL_ROWS, type ChannelSummary, type SocialRow } from "@/lib/social-channels";
import { dayTime } from "@/lib/time";

type Summary = { channels: ChannelSummary[] };
// Module-level: useJob restarts its polling when `pick` changes.
const pickSummary = (d: Summary) => d.channels;
/** Connections as the landing shows them: the list, "hidden" (the role can't read them), or "failed". */
type Conns = { list: Connection[]; names: Map<string, string> } | "hidden" | "failed" | null;

/**
 * The Social & Content page (Wave's slot): one row per channel with its connection, its next planned post and how many
 * posts wait for approval; a row opens the Content calendar filtered to it. Counts come from GET content/summary, the
 * connections from GET connections (only for roles that hold CONNECTIONS_READ: `canSeeConnections`).
 */
export function SocialLanding({ workspaceId, brandId, canSeeConnections, blogOn }: { workspaceId: string; brandId: string; canSeeConnections: boolean; blogOn: boolean }) {
  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  const { data, failed, reload } = useJob(`${base}/content/summary`, { pick: pickSummary as (d: never) => ChannelSummary[], intervals: JOB_INTERVALS.socialLanding });
  const [conns, setConns] = useState<Conns>(canSeeConnections ? null : "hidden");
  useEffect(() => {
    if (!canSeeConnections) return;
    let live = true;
    settingsApi.connections(workspaceId, brandId).then(
      (r) => live && setConns({ list: r.connections, names: new Map(r.providers.map((p) => [p.provider, p.label])) }),
      // A 403 means the role can't see them after all: no column, not an error.
      (e) => live && setConns(e instanceof ApiError && e.status === 403 ? "hidden" : "failed"),
    );
    return () => {
      live = false;
    };
  }, [workspaceId, brandId, canSeeConnections]);

  return (
    <PageSection
      id="channels"
      title="Channels"
      description="Open a channel to plan it on the Content calendar."
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/calendar">Open the full calendar</Link>
        </Button>
      }
      className="pt-1"
    >
      {!data ? (
        failed ? <LoadFailed what="the channels" onRetry={reload} /> : <ListSkeleton label="Loading channels" rows={4} />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {SOCIAL_ROWS.map((row) => (
            <ChannelRow key={row.key} row={row} summary={data} conns={conns} />
          ))}
          {blogOn && <BlogRow />}
        </ul>
      )}
    </PageSection>
  );
}

const ROW = "grid gap-x-4 gap-y-2 rounded-xl px-2 py-3 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1.3fr)_auto] md:items-center";

function RowName({ icon: Icon, label, blurb, href }: { icon: LucideIcon; label: string; blurb: string; href: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent">
        <Icon aria-hidden className="size-4" />
      </span>
      <div className="min-w-0">
        {/* The name is the row's link; its ::after covers the row, so the whole row opens the calendar. */}
        <Link href={href} className="font-medium after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none">
          {label}
        </Link>
        <p className="truncate text-xs text-muted-foreground">{blurb}</p>
      </div>
    </div>
  );
}

function ChannelRow({ row, summary, conns }: { row: SocialRow; summary: ChannelSummary[]; conns: Conns }) {
  const { awaiting, next } = rowSummary(summary, row.filter);
  const lines = conns && typeof conns === "object" ? connectionLines(row.providers, conns.list, conns.names) : row.providers.length ? null : "byHand";
  return (
    <li className={`relative ${ROW} transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring hover:bg-muted`}>
      <RowName icon={channelIcon(row.filter)} label={row.label} blurb={row.blurb} href={calendarHref({ channel: row.filter })} />
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {lines === "byHand" ? (
          <StatusBadge quiet tone="muted">Posted by hand</StatusBadge>
        ) : lines ? (
          lines.map((l) => (
            <StatusBadge key={l.provider} quiet tone={l.tone}>
              {row.providers.length > 1 ? `${l.name}: ${l.label}` : l.label}
            </StatusBadge>
          ))
        ) : conns === "failed" ? (
          <span className="text-xs text-muted-foreground">Connection unavailable</span>
        ) : conns === null ? (
          <span className="text-xs text-muted-foreground">Checking connection…</span>
        ) : null}
      </div>
      <div className="min-w-0 text-sm">
        {next ? (
          // Above the row's link (relative z-10), so it opens this post rather than the channel.
          <Link href={calendarHref({ channel: row.filter }, next.id)} aria-label={`${row.label}, next: ${next.title}, ${dayTime(next.scheduledFor)}, ${STATUS_LABEL[next.status] ?? next.status}`} className="relative z-10 flex min-w-0 items-center gap-2 rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <span className="shrink-0 text-muted-foreground">Next</span>
            <span className="truncate">{next.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{dayTime(next.scheduledFor)}</span>
            <StatusBadge quiet status={next.status}>
              {STATUS_LABEL[next.status] ?? next.status}
            </StatusBadge>
          </Link>
        ) : (
          <span className="text-muted-foreground">Nothing scheduled</span>
        )}
      </div>
      <div className="flex items-center justify-between gap-2 md:justify-end">
        {awaiting ? (
          <Link href={calendarHref({ channel: row.filter, status: "awaiting" })} aria-label={`${row.label}: ${awaiting} awaiting approval`} className="relative z-10 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <StatusBadge tone="info">{awaiting} awaiting approval</StatusBadge>
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">None waiting</span>
        )}
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </div>
    </li>
  );
}

/** The blog isn't on the calendar: its articles have no publish date yet, so the row says so instead of showing 0. */
function BlogRow() {
  return (
    <li className={`relative ${ROW} transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring hover:bg-muted`}>
      <RowName icon={Newspaper} label="Blog" blurb="Articles for the store's blog" href="/blog" />
      <div />
      <div className="text-sm text-muted-foreground">Articles live on the Blog page</div>
      <div className="flex items-center justify-between gap-2 md:justify-end">
        <span className="text-xs text-muted-foreground">
          <span aria-hidden>—</span>
          <span className="sr-only">Approvals not counted</span>
        </span>
        <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </div>
    </li>
  );
}
