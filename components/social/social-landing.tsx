"use client";

import Link from "next/link";
import { ChevronRight, Newspaper } from "lucide-react";
import { ListSkeleton } from "@/components/settings/shared";
import { ChannelConnection, useChannelConnections, type Conns } from "@/components/social/channel-connection";
import { LoadFailed } from "@/components/ui/load-failed";
import { PageSection } from "@/components/ui/page-section";
import { StatusBadge } from "@/components/ui/status-badge";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import type { ContentItem } from "@/components/workspace/content-panels";
import { calendarHref } from "@/lib/calendar-filter";
import { channelIcon, channelLabel, STATUS_LABEL, type ChannelIcon } from "@/lib/post-labels";
import { attentionPosts, connectionState, landingCounts, providersOf, rowSummary, SOCIAL_ROWS, type ChannelSummary, type SocialRow } from "@/lib/social-channels";
import { dayTime } from "@/lib/time";

type Summary = { channels: ChannelSummary[] };
// Module-level: useJob restarts its polling when `pick` changes.
const pickSummary = (d: Summary) => d.channels;
const pickItems = (d: { items: ContentItem[] }) => d.items;
const CONNECTIONS = "/connections";

/**
 * The Social & Content page (Wave's slot): three figures, one row per channel with its connection, its next planned post
 * and how many posts wait for approval (a row opens the Content calendar filtered to it), then the posts awaiting
 * approval and the next ones going out. Counts come from GET content/summary, the posts from the calendar's list
 * (GET content), the connections from GET connections (only for roles that hold CONNECTIONS_READ: `canSeeConnections`).
 * `canManageConnections` (integrations.manage) offers Connect and Manage, as the Connections page does.
 */
export function SocialLanding({ workspaceId, brandId, canSeeConnections, canManageConnections, blogOn }: { workspaceId: string; brandId: string; canSeeConnections: boolean; canManageConnections: boolean; blogOn: boolean }) {
  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  const { data, failed, reload } = useJob(`${base}/content/summary`, { pick: pickSummary as (d: never) => ChannelSummary[], intervals: JOB_INTERVALS.socialLanding });
  // ponytail: the calendar's list (open posts + 30 days, 200 rows) feeds the Scheduled figure and the short lists; a brand
  // past 200 open posts (undated ones sort first) undercounts them. A scheduled count in content/summary is the upgrade.
  const posts = useJob(`${base}/content`, { pick: pickItems as (d: never) => ContentItem[], intervals: JOB_INTERVALS.socialLanding });
  const conns = useChannelConnections(workspaceId, brandId, canSeeConnections);

  return (
    <>
      {data && <Figures summary={data} items={posts.data} conns={conns} />}
      <PageSection id="channels" title="Your channels" description="Open a channel to plan it on its own calendar." className="pt-1">
        {!data ? (
          failed ? <LoadFailed what="the channels" onRetry={reload} /> : <ListSkeleton label="Loading channels" rows={4} />
        ) : (
          <>
            <ul className="-mx-2 flex flex-col divide-y divide-border @container/social">
              {SOCIAL_ROWS.map((row) => (
                <ChannelRow key={row.key} row={row} summary={data} conns={conns} canManage={canManageConnections} />
              ))}
              {blogOn && <BlogRow />}
            </ul>
            {/* Facebook Pages and Instagram are two logins on Connections (the server's META and INSTAGRAM providers). */}
            {conns !== "hidden" && <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              Meta is Facebook Pages and Instagram, which connect separately: it reads Partially connected while only one is. The Instagram row is that same Instagram connection.
            </p>}
          </>
        )}
      </PageSection>
      {posts.data && <Attention items={posts.data} />}
    </>
  );
}

/** Connected accounts, scheduled posts and posts awaiting approval, each linking to where it is counted. */
function Figures({ summary, items, conns }: { summary: ChannelSummary[]; items: ContentItem[] | null; conns: Conns }) {
  const n = landingCounts(summary, items ?? [], conns && typeof conns === "object" ? conns.list : null);
  const figure = (label: string, value: number | null, href: string) => (
    <div key={label} className="min-w-0 rounded-xl border border-border bg-card px-3 py-2.5 sm:px-4">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>
        {value === null ? (
          <span className="text-lg text-muted-foreground" aria-label="Not loaded">
            —
          </span>
        ) : (
          <Link href={href} className="rounded text-lg font-semibold tabular-nums underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            {value}
          </Link>
        )}
      </dd>
    </div>
  );
  return (
    <dl aria-label="Channels at a glance" className="grid grid-cols-3 gap-2 sm:max-w-2xl sm:gap-3">
      {/* Accounts connected for publishing; LinkedIn and X are published by hand and never count here. */}
      {conns !== "hidden" && figure("Connected accounts", n.accounts, CONNECTIONS)}
      {figure("Scheduled", items ? n.scheduled : null, calendarHref({ status: "scheduled" }))}
      {figure("Awaiting approval", n.awaiting, calendarHref({ status: "awaiting" }))}
    </dl>
  );
}

// Identity, connection, next post, its date, approvals, the arrow: one template for every row (the blog's too) once the
// list is 49rem wide (a container query: the sidebar and the docked assistant narrow the page, not the window), so the
// columns line up whatever a row holds; a stacked card under that. The minimums add up to ~48rem with the gaps.
const ROW =
  "grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 px-2 py-3 @min-[49rem]/social:min-h-[5.25rem] @min-[49rem]/social:grid-cols-[minmax(9.5rem,1.05fr)_minmax(8.75rem,0.9fr)_minmax(10rem,2fr)_minmax(7.5rem,0.95fr)_minmax(8.25rem,auto)_1.25rem] @min-[49rem]/social:items-center";
const ACTION = "relative z-10 inline-flex h-6 items-center rounded-full border border-border bg-card px-2.5 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const ROW_LINK = "relative z-10 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function RowName({ icon: Icon, label, blurb, href }: { icon: ChannelIcon; label: string; blurb: string; href: string }) {
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

function ChannelRow({ row, summary, conns, canManage }: { row: SocialRow; summary: ChannelSummary[]; conns: Conns; canManage: boolean }) {
  const { awaiting, next } = rowSummary(summary, row.filter);
  const providers = providersOf(row.filter);
  const state = conns && typeof conns === "object" ? connectionState(providers, conns.list, conns.names) : null;
  // Connect while any of its connections isn't working; Manage once all are. Only for people who manage connections.
  const action = !canManage || !state || state.kind === "manual" ? null : state.kind === "connected" ? "Manage" : state.kind === "reconnect" ? "Reconnect" : "Connect";
  return (
    <li className={`relative ${ROW} rounded-lg transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring hover:bg-muted/60`}>
      <RowName icon={channelIcon(row.filter)} label={row.label} blurb={row.blurb} href={calendarHref({ channel: row.filter })} />
      <ChevronRight aria-hidden className="size-4 shrink-0 self-center text-muted-foreground @min-[49rem]/social:order-last" />
      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 @min-[49rem]/social:col-span-1 @min-[49rem]/social:flex-col @min-[49rem]/social:flex-nowrap @min-[49rem]/social:items-start">
        <ChannelConnection filter={row.filter} conns={conns} />
        {!providers.length && <span className="text-xs text-muted-foreground">Published by hand</span>}
        {action && (
          <Link href={CONNECTIONS} aria-label={`${action} ${row.label}`} className={ACTION}>
            {action}
          </Link>
        )}
      </div>
      <div className="col-span-2 flex min-w-0 items-center gap-2 text-sm @min-[49rem]/social:col-span-1">
        {next ? (
          // Above the row's link (relative z-10), so it opens this post rather than the channel.
          <Link href={calendarHref({ channel: row.filter }, next.id)} title={next.title} aria-label={`${row.label}, next: ${next.title}, ${dayTime(next.scheduledFor)}, ${STATUS_LABEL[next.status] ?? next.status}`} className={`${ROW_LINK} flex min-w-0 items-center gap-2 hover:underline @min-[49rem]/social:flex-col @min-[49rem]/social:items-start @min-[49rem]/social:gap-1`}>
            <span className="max-w-full truncate @min-[49rem]/social:line-clamp-2 @min-[49rem]/social:whitespace-normal">{next.title}</span>
            <StatusBadge quiet status={next.status}>
              {STATUS_LABEL[next.status] ?? next.status}
            </StatusBadge>
          </Link>
        ) : (
          <span className="text-muted-foreground">Nothing scheduled</span>
        )}
      </div>
      <div className="whitespace-nowrap text-xs tabular-nums text-muted-foreground @min-[49rem]/social:text-sm">{next ? dayTime(next.scheduledFor) : null}</div>
      <div className="flex items-center justify-end">
        {awaiting ? (
          <Link href={calendarHref({ channel: row.filter, status: "awaiting" })} aria-label={`${row.label}: ${awaiting} awaiting approval`} className={`${ROW_LINK} rounded-full`}>
            <StatusBadge tone="info">{awaiting} awaiting approval</StatusBadge>
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">None waiting</span>
        )}
      </div>
    </li>
  );
}

/** The blog isn't on the calendar: its articles have no publish date yet, so the row says so instead of showing 0. */
function BlogRow() {
  return (
    <li className={`relative ${ROW} rounded-lg transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring hover:bg-muted/60`}>
      <RowName icon={Newspaper} label="Blog" blurb="Articles for the store's blog" href="/blog" />
      <ChevronRight aria-hidden className="size-4 shrink-0 self-center text-muted-foreground @min-[49rem]/social:order-last" />
      <div className="hidden @min-[49rem]/social:block" />
      <div className="col-span-2 text-sm text-muted-foreground @min-[49rem]/social:col-span-1">Articles live on the Blog page</div>
      <div className="hidden @min-[49rem]/social:block" />
      <div className="text-right text-xs text-muted-foreground">
        <span aria-hidden>—</span>
        <span className="sr-only">Approvals not counted</span>
      </div>
    </li>
  );
}

/** Posts awaiting approval and the next ones going out, from the calendar's list; nothing when both are empty. */
function Attention({ items }: { items: ContentItem[] }) {
  const { awaiting, upcoming } = attentionPosts(items, new Date());
  if (!awaiting.length && !upcoming.length) return null;
  // Two equal columns once there's room for both (a container query, as for the rows), stacked under that.
  return (
    <div className="@container/attention">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 @min-[48rem]/attention:grid-cols-2">
        <PostList id="awaiting" title="Awaiting approval" posts={awaiting} more={calendarHref({ status: "awaiting" })} empty="Nothing waiting for approval." />
        <PostList id="upcoming" title="Coming up" posts={upcoming} more="/calendar" empty="Nothing planned yet." />
      </div>
    </div>
  );
}

function PostList({ id, title, posts, more, empty }: { id: string; title: string; posts: ContentItem[]; more: string; empty: string }) {
  return (
    <PageSection
      id={id}
      title={title}
      actions={
        <Link href={more} className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Open in calendar
        </Link>
      }
      className="px-3 py-2"
    >
      {!posts.length && <p className="px-2 py-1.5 text-sm text-muted-foreground">{empty}</p>}
      <ul className="flex flex-col">
        {posts.map((p) => {
          const Icon = channelIcon(p.channel);
          return (
            <li key={p.id}>
              <Link href={calendarHref({}, p.id)} title={p.title} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <Icon aria-hidden className="size-4 shrink-0" />
                <span className="sr-only">{channelLabel(p.channel)}: </span>
                <span className="min-w-0 flex-1 truncate text-sm">{p.title}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.scheduledFor ? dayTime(p.scheduledFor) : "No date"}</span>
                <StatusBadge quiet status={p.status}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </StatusBadge>
              </Link>
            </li>
          );
        })}
      </ul>
    </PageSection>
  );
}
