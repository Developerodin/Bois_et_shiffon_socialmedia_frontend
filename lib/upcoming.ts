import { zoneToday } from "@/lib/data-api";
import type { TaskDto, UpcomingDto, UpcomingMilestoneDto } from "@/shared";

/** A post due in the next 7 days, as the Overview lists it (from the content list it already polls). */
export type WeekPost = { id: string; title: string; channel: string; scheduledFor: string };

/** One row of the Overview's Next 7 days: a post, a website task or a milestone, keyed by a brand-local day. */
export type UpcomingRow =
  | { kind: "post"; id: string; day: string; at: string; title: string; channel: string }
  | { kind: "website"; id: string; day: string; title: string }
  | { kind: "milestone"; id: string; day: string; title: string; project: { id: string; name: string } };

const KIND_ORDER = { post: 0, website: 1, milestone: 2 } as const;

/** How many rows the section shows; the rest are counted under "more" links. */
export const UPCOMING_ROWS = 8;

/**
 * The rows in date order, at most `limit`, and how many of each kind are left out (`more`). Every row sorts on a
 * brand-local day: tasks and milestones by their due day, a post by its time turned into a day in the brand's zone (the
 * route's `timeZone`). Posts past the route's `to` are
 * left out (the posts' 7 × 24 h window can reach an eighth day). Without the route (tasks off or not loaded), posts are
 * keyed in the browser's zone, which only orders them. Ties: posts by time, then post, website, milestone, then title.
 */
export function mergeUpcoming(posts: WeekPost[], upcoming: Pick<UpcomingDto, "timeZone" | "to" | "website" | "milestones"> | null, limit = UPCOMING_ROWS) {
  const zone = upcoming?.timeZone;
  const rows: UpcomingRow[] = [];
  for (const p of posts) {
    const day = zoneToday(zone, new Date(p.scheduledFor));
    if (upcoming && day > upcoming.to) continue;
    rows.push({ kind: "post", id: p.id, day, at: p.scheduledFor, title: p.title, channel: p.channel });
  }
  for (const t of upcoming?.website.tasks ?? ([] as TaskDto[])) if (t.dueOn) rows.push({ kind: "website", id: t.id, day: t.dueOn, title: t.title });
  for (const m of upcoming?.milestones.items ?? ([] as UpcomingMilestoneDto[])) rows.push({ kind: "milestone", id: m.id, day: m.dueOn, title: m.title, project: m.project });
  rows.sort(
    (a, b) =>
      a.day.localeCompare(b.day) ||
      (a.kind === "post" && b.kind === "post" ? a.at.localeCompare(b.at) : 0) ||
      KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
      a.title.localeCompare(b.title),
  );
  const shown = rows.slice(0, limit);
  const count = (k: UpcomingRow["kind"]) => shown.filter((r) => r.kind === k).length;
  // What the rows leave out, per kind: posts from the full list, tasks and milestones from the route's window counts.
  const more = {
    post: rows.filter((r) => r.kind === "post").length - count("post"),
    website: Math.max(0, (upcoming?.website.count ?? 0) - count("website")),
    milestone: Math.max(0, (upcoming?.milestones.count ?? 0) - count("milestone")),
  };
  return { rows: shown, more };
}
