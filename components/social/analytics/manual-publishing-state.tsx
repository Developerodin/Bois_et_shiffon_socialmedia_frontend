"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { request } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import type { ContentItem } from "@/components/workspace/content-panels";
import type { ManualChannel } from "@/lib/analytics-channels";
import { calendarHref } from "@/lib/calendar-filter";
import { STATUS_LABEL } from "@/lib/post-labels";
import { attentionPosts } from "@/lib/social-channels";
import { dayTime } from "@/lib/time";
import { AnalyticsEmptyState } from "./analytics-states";
import type { Icon } from "./channel-icons";

/** The channel's next posts: awaiting approval and coming up (lib/social-channels attentionPosts), soonest first, undated last. */
export function plannedPosts(items: readonly ContentItem[], postChannel: string, now: Date, n = 5): ContentItem[] {
  const { awaiting, upcoming } = attentionPosts(
    items.filter((i) => i.channel === postChannel),
    now,
    n,
  );
  const at = (i: ContentItem) => (i.scheduledFor ? Date.parse(i.scheduledFor) : Infinity);
  return [...awaiting, ...upcoming].sort((a, b) => at(a) - at(b)).slice(0, n);
}

/**
 * A channel published by hand (LinkedIn, X): no platform sends its numbers through this workflow, so instead of an
 * empty dashboard, what happens to its posts, Plan posts (and the ones already out, on the calendar's Published
 * filter), and its next planned posts from the calendar's list (GET content, filtered here). The list is a help, not the point: when it can't be read, it is just left out.
 */
export function ManualPublishingState({ base, channel, icon, status }: { base: string; channel: ManualChannel; icon: Icon; status?: ReactNode }) {
  const [items, setItems] = useState<ContentItem[] | null | "failed">(null);
  useEffect(() => {
    let live = true;
    request<{ items: ContentItem[] }>(`${base}/content`).then(
      (r) => live && setItems(r.items),
      () => live && setItems("failed"),
    );
    return () => {
      live = false;
    };
  }, [base]);
  const planned = Array.isArray(items) ? plannedPosts(items, channel.postChannel, new Date()) : null;

  return (
    <AnalyticsEmptyState
      icon={icon}
      status={status}
      title={`${channel.label} is published by hand`}
      primary={
        <Button asChild size="sm">
          <Link href={channel.calendar}>
            <CalendarPlus aria-hidden />
            Plan {channel.label} posts
          </Link>
        </Button>
      }
      secondary={
        <Button asChild size="sm" variant="outline">
          <Link href={calendarHref({ channel: channel.postChannel, status: "published" })}>See published posts</Link>
        </Button>
      }
      aside={items === "failed" ? undefined : <Planned channel={channel} posts={planned} />}
    >
      {channel.workflow} Because the posts don&apos;t go out through a connection, {channel.label} sends no numbers here: reach, likes and the rest are in {channel.label}&apos;s own analytics.
    </AnalyticsEmptyState>
  );
}

function Planned({ channel, posts }: { channel: ManualChannel; posts: ContentItem[] | null }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm font-medium">Coming up on {channel.label}</p>
        <Link href={channel.calendar} className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          Open in calendar
        </Link>
      </div>
      {posts === null ? (
        <div aria-busy="true" aria-label="Loading planned posts" className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing planned for {channel.label} yet.</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {posts.map((p) => (
            <li key={p.id}>
              <Link href={calendarHref({ channel: channel.postChannel }, p.id)} title={p.title} className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 rounded-lg px-2 py-1.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                <span className="min-w-[8rem] flex-1 truncate text-sm">{p.title || "Untitled"}</span>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{p.scheduledFor ? dayTime(p.scheduledFor) : "No date"}</span>
                <StatusBadge quiet status={p.status}>
                  {STATUS_LABEL[p.status] ?? p.status}
                </StatusBadge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
