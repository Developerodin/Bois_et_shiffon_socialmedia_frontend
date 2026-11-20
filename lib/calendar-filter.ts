import { inNextWeek, STATUS_GROUPS } from "@/shared";

/** The parts of a calendar post the filters read; ContentItem satisfies it. */
export type CalendarItem = {
  id: string;
  channel: string;
  status: string;
  scheduledFor: string | null;
  publishIssue: "FAILED" | "CHECK" | null;
  byHand?: boolean;
  campaignId?: string | null;
  /** Older servers omit it: undefined reads as unassigned. */
  owner?: { id: string; name: string | null } | null;
  latest: { check?: { overall: string } | null } | null;
};

export type StatusGroup = keyof typeof STATUS_GROUPS;
export type CalendarFilter = { channel?: string; status?: StatusGroup; campaignId?: string; owner?: "me" | "none"; need?: "overdue" | "blocked" | "week" };

const PIPELINE: readonly string[] = [...STATUS_GROUPS.toWrite, ...STATUS_GROUPS.awaiting, ...STATUS_GROUPS.approved];
const PUBLISHED: readonly string[] = STATUS_GROUPS.published;

/** Date passed while still in the pipeline; a by-hand story is overdue whatever its status. */
export function isOverdue(i: Pick<CalendarItem, "status" | "scheduledFor" | "byHand">, now: Date): boolean {
  if (!i.scheduledFor || new Date(i.scheduledFor).getTime() >= now.getTime()) return false;
  return !!i.byHand || PIPELINE.includes(i.status);
}

export function isBlocked(i: Pick<CalendarItem, "status" | "publishIssue" | "latest">): boolean {
  return i.status === "BLOCKED" || i.latest?.check?.overall === "BLOCKER" || !!i.publishIssue;
}

export function isThisWeek(i: Pick<CalendarItem, "status" | "scheduledFor">, now: Date): boolean {
  return inNextWeek(i.scheduledFor, now) && !PUBLISHED.includes(i.status);
}

export function filterItems<T extends CalendarItem>(items: T[], f: CalendarFilter, me: string | null, now: Date): T[] {
  return items.filter(
    (i) =>
      (!f.channel || i.channel === f.channel) &&
      (!f.status || (STATUS_GROUPS[f.status] as readonly string[]).includes(i.status)) &&
      (!f.campaignId || i.campaignId === f.campaignId) &&
      (f.owner !== "me" || (!!me && i.owner?.id === me)) &&
      (f.owner !== "none" || i.owner == null) &&
      (f.need !== "overdue" || isOverdue(i, now)) &&
      (f.need !== "blocked" || isBlocked(i)) &&
      (f.need !== "week" || isThisWeek(i, now)),
  );
}

const KEYS = ["channel", "status", "campaignId", "owner", "need"] as const;
const param = (k: (typeof KEYS)[number]) => `cf_${k}`;
const OWNERS = ["me", "none"], NEEDS = ["overdue", "blocked", "week"];

export function filterFromSearch(q: URLSearchParams): CalendarFilter {
  const f: CalendarFilter = {};
  const channel = q.get("cf_channel"), status = q.get("cf_status"), campaignId = q.get("cf_campaignId"), owner = q.get("cf_owner"), need = q.get("cf_need");
  if (channel) f.channel = channel;
  if (status && status in STATUS_GROUPS) f.status = status as StatusGroup;
  if (campaignId) f.campaignId = campaignId;
  if (owner && OWNERS.includes(owner)) f.owner = owner as "me" | "none";
  if (need && NEEDS.includes(need)) f.need = need as NonNullable<CalendarFilter["need"]>;
  return f;
}

/** The filter as query-string text without the leading "?" (empty for no filter). */
export function filterToSearch(f: CalendarFilter): string {
  const q = new URLSearchParams();
  for (const k of KEYS) if (f[k]) q.set(param(k), f[k]!);
  return q.toString();
}

/** Replace the cf_ params in a query string with this filter's, keeping every other param. */
export function withFilter(search: string, f: CalendarFilter): string {
  const q = new URLSearchParams(search);
  for (const k of KEYS) q.delete(param(k));
  for (const [k, v] of new URLSearchParams(filterToSearch(f))) q.set(k, v);
  return q.toString();
}
