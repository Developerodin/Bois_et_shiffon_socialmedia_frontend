"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { CalendarDays, Flag, Globe } from "lucide-react";
import { ListSkeleton } from "@/components/settings/shared";
import { LoadFailed } from "@/components/ui/load-failed";
import { useTasksChanged } from "@/components/tasks/task-list";
import { useBrandData, type ContentItem } from "@/components/workspace/content-panels";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { filterToSearch, isThisWeek } from "@/lib/calendar-filter";
import { zoneToday } from "@/lib/data-api";
import { CHANNEL_LABEL } from "@/lib/post-labels";
import { mergeUpcoming, type UpcomingRow, type WeekPost } from "@/lib/upcoming";
import type { View } from "@/lib/workspace-view";
import type { UpcomingDto } from "@/shared";

/** Posts in the next 7 days (isThisWeek, the calendar's "Next 7 days" filter), soonest first. Module level: useJob needs a stable pick. */
const pickWeekPosts = (d: { items: ContentItem[] }): WeekPost[] => {
  const now = new Date();
  return d.items
    .filter((i) => isThisWeek(i, now))
    .map((i) => ({ id: i.id, title: i.title, channel: i.channel, scheduledFor: i.scheduledFor! }))
    .sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
};
const pickUpcoming = (d: UpcomingDto) => d;

const DAY = new Intl.DateTimeFormat(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const TIME = (zone: string | undefined) => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit", timeZone: zone });

function dayLabel(day: string, today: string) {
  if (day === today) return "Today";
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  return day === tomorrow ? "Tomorrow" : DAY.format(new Date(`${day}T00:00:00Z`));
}

const ICON = { post: CalendarDays, website: Globe, milestone: Flag } as const;

/**
 * The Overview's Next 7 days: posts from the content list Home already polls, and (flag `tasks` with tasks.read,
 * `withTasks`) website tasks due and project milestones from GET upcoming, polled every minute and after a task change.
 * Each row opens its record: a post or task in the peek, a milestone on its project page. A part that fails shows Retry
 * under the rows that did load.
 */
export function UpcomingWeek({ base, withTasks, onOpen }: { base: string; withTasks: boolean; onOpen: (v: View) => void }) {
  const posts = useBrandData(base, "content", pickWeekPosts as (d: never) => WeekPost[]);
  const upcoming = useJob(`${base}/upcoming`, { pick: pickUpcoming as (d: never) => UpcomingDto, intervals: JOB_INTERVALS.tasks, off: !withTasks });
  const reloadUpcoming = upcoming.reload;
  useTasksChanged(reloadUpcoming);
  useEffect(() => {
    if (!withTasks) return;
    const onFocus = () => void reloadUpcoming();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [reloadUpcoming, withTasks]);

  const route = withTasks ? upcoming.data : null;
  const { rows, more } = useMemo(() => mergeUpcoming(posts.data ?? [], route), [posts.data, route]);
  const loading = (posts.data == null && !posts.failed) || (withTasks && upcoming.data == null && !upcoming.failed);
  // A part that failed with nothing to show: never say "nothing scheduled", only what did load and Retry.
  const partFailed = (posts.data == null && posts.failed) || (withTasks && upcoming.data == null && upcoming.failed);
  const today = route?.from ?? zoneToday(undefined);
  const time = TIME(route?.timeZone);

  const links = [
    more.post > 0 && { href: `/calendar?${filterToSearch({ need: "week" })}`, text: `${more.post} more ${more.post === 1 ? "post" : "posts"}` },
    more.website > 0 && { href: "/tasks?area=website", text: `${more.website} more website ${more.website === 1 ? "task" : "tasks"}` },
    more.milestone > 0 && { href: "/projects", text: `${more.milestone} more ${more.milestone === 1 ? "milestone" : "milestones"}` },
  ].filter((l): l is { href: string; text: string } => !!l);

  const label = (r: UpcomingRow) => (r.kind === "post" ? CHANNEL_LABEL[r.channel] ?? "Post" : r.kind === "website" ? "Website" : `Milestone · ${r.project.name}`);
  const rowClass = "flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  const body = (r: UpcomingRow) => {
    const Icon = ICON[r.kind];
    return (
      <>
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent" aria-hidden="true">
          <Icon className="size-4 text-accent-foreground" />
        </span>
        <span className="min-w-[10rem] flex-1">
          <span className="line-clamp-2 text-sm font-medium">{r.title || "Untitled"}</span>
          <span className="block text-xs text-muted-foreground">{label(r)}</span>
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {dayLabel(r.day, today)}
          {r.kind === "post" ? ` · ${time.format(new Date(r.at))}` : ""}
        </span>
      </>
    );
  };

  return (
    <section aria-labelledby="week-h" className="px-5 pb-8">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="week-h" className="text-base font-semibold">
          Next 7 days
        </h2>
        <Link href={`/calendar?${filterToSearch({ need: "week" })}`} className="shrink-0 text-xs font-medium text-primary-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Open calendar
        </Link>
      </div>
      {rows.length > 0 ? (
        <ul className="mt-4 divide-y divide-border rounded-xl border border-border">
          {rows.map((r) => (
            <li key={`${r.kind}:${r.id}`}>
              {r.kind === "milestone" ? (
                <Link href={`/projects/${encodeURIComponent(r.project.id)}`} className={rowClass}>
                  {body(r)}
                </Link>
              ) : (
                <button type="button" onClick={() => onOpen(r.kind === "post" ? { kind: "content", id: r.id } : { kind: "task", id: r.id })} className={rowClass}>
                  {body(r)}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : loading ? (
        <div className="mt-4">
          <ListSkeleton label="Loading the next 7 days" rows={2} />
        </div>
      ) : partFailed ? null : (
        <p className="mt-4 text-sm text-muted-foreground">Nothing scheduled in the next 7 days.</p>
      )}
      {links.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="font-medium text-primary-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {l.text}
            </Link>
          ))}
        </p>
      )}
      {posts.data == null && posts.failed && <LoadFailed what="the posts coming up" onRetry={() => void posts.reload()} className="mt-2" />}
      {withTasks && upcoming.data == null && upcoming.failed && <LoadFailed what="website tasks and milestones" onRetry={() => void reloadUpcoming()} className="mt-2" />}
    </section>
  );
}
