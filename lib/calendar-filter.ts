import { CHANNEL_LABEL } from "@/lib/post-labels";
import { CHANNEL_GROUPS, channelsOf, inNextWeek, isBlocked, isChannelGroup, isOverdue, STATUS_GROUPS } from "@/shared";

// The channel groups (meta, instagram) live in shared/ so the calendar export takes the same values.
export { CHANNEL_GROUPS, channelsOf, isBlocked, isOverdue };

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

const PUBLISHED: readonly string[] = STATUS_GROUPS.published;

/**
 * The Channel filter's choices: each group some present channel belongs to, then the present channels, then the
 * current value if it is neither (a group, or a channel with no posts yet, opened from the Social & Content page), so
 * the pill never reads "All channels" while a filter is on.
 */
export function channelOptions(present: readonly string[], current?: string): string[] {
  const groups = Object.keys(CHANNEL_GROUPS).filter((g) => g === current || channelsOf(g).some((c) => present.includes(c)));
  const out = [...groups, ...present];
  return current && !out.includes(current) ? [...out, current] : out;
}

export function isThisWeek(i: Pick<CalendarItem, "status" | "scheduledFor">, now: Date): boolean {
  return inNextWeek(i.scheduledFor, now) && !PUBLISHED.includes(i.status);
}

/** The owner line, matching the Unassigned filter: no owner is "Unassigned"; an owner the server sent no name for is still someone. */
export function ownerLabel(owner: CalendarItem["owner"]): string {
  return owner == null ? "Unassigned" : owner.name || "A team member";
}

export function filterItems<T extends CalendarItem>(items: T[], f: CalendarFilter, me: string | null, now: Date): T[] {
  return items.filter(
    (i) =>
      (!f.channel || channelsOf(f.channel).includes(i.channel)) &&
      (!f.status || (STATUS_GROUPS[f.status] as readonly string[]).includes(i.status)) &&
      (!f.campaignId || i.campaignId === f.campaignId) &&
      (f.owner !== "me" || !me || i.owner?.id === me) &&
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
  if (channel && (isChannelGroup(channel) || Object.hasOwn(CHANNEL_LABEL, channel))) f.channel = channel;
  if (status && Object.hasOwn(STATUS_GROUPS, status)) f.status = status as StatusGroup;
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

/** The Content calendar page with this filter, and the post open in its peek when given. */
export function calendarHref(f: CalendarFilter, post?: string): string {
  const q = new URLSearchParams(filterToSearch(f));
  if (post) q.set("post", post);
  const s = q.toString();
  return s ? `/calendar?${s}` : "/calendar";
}

/** Replace the cf_ params in a query string with this filter's, keeping every other param. */
export function withFilter(search: string, f: CalendarFilter): string {
  const q = new URLSearchParams(search);
  for (const k of KEYS) q.delete(param(k));
  for (const [k, v] of new URLSearchParams(filterToSearch(f))) q.set(k, v);
  return q.toString();
}

/** How many filters are set, for the Filters button's count. */
export const activeFilterCount = (f: CalendarFilter): number => KEYS.filter((k) => f[k]).length;
