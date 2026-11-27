import type { Connection, Provider } from "@/components/settings/api";
import { channelsOf, type CalendarItem } from "@/lib/calendar-filter";
import { channelLabel } from "@/lib/post-labels";
import { connectionBadge, type Tone } from "@/lib/status";
import { OPEN_STATUSES, STATUS_GROUPS } from "@/shared";

/** The next planned post on a channel, as GET content/summary sends it. */
export type NextPost = { id: string; title: string; scheduledFor: string; status: string };
/** One channel's line of GET content/summary. */
export type ChannelSummary = { channel: string; awaiting: number; next: NextPost | null };

/**
 * The connection each channel publishes through; null: no publishing API, posted by hand. Mirrors the server's
 * CHANNEL_PROVIDER (server/services/publishing.ts): Facebook goes through a Facebook Pages login (META) and every
 * Instagram format through its own Instagram login (INSTAGRAM), two separate connections.
 */
export const CHANNEL_PROVIDER: Readonly<Record<string, Provider | null>> = {
  FACEBOOK_POST: "META",
  INSTAGRAM_POST: "INSTAGRAM",
  INSTAGRAM_CAROUSEL: "INSTAGRAM",
  INSTAGRAM_REEL: "INSTAGRAM",
  INSTAGRAM_STORY: "INSTAGRAM",
  PINTEREST_PIN: "PINTEREST",
  THREADS_POST: "THREADS",
  LINKEDIN_POST: null,
  X_POST: null,
};

/** The connections a calendar channel filter (a channel or a group) publishes through, each once; none: posted by hand. */
export function providersOf(filter: string): Provider[] {
  const out: Provider[] = [];
  for (const c of channelsOf(filter)) {
    const p = CHANNEL_PROVIDER[c];
    if (p && !out.includes(p)) out.push(p);
  }
  return out;
}

/**
 * The Social & Content page's rows, in order; a channel calendar's header names its channel from them too. `filter`:
 * the calendar's cf_channel value the row opens (a channel or a channel group); its connections are providersOf(filter).
 * The Blog row is the page's own (it links to /blog, not the calendar).
 */
export const SOCIAL_ROWS = [
  { key: "meta", label: "Meta", blurb: "Facebook and Instagram on one calendar", filter: "meta" },
  { key: "instagram", label: "Instagram", blurb: "Posts, carousels, Reels and stories", filter: "instagram" },
  { key: "pinterest", label: channelLabel("PINTEREST_PIN"), blurb: "Pins with their link", filter: "PINTEREST_PIN" },
  { key: "linkedin", label: channelLabel("LINKEDIN_POST"), blurb: "Company posts", filter: "LINKEDIN_POST" },
  { key: "x", label: channelLabel("X_POST"), blurb: "Posts", filter: "X_POST" },
  { key: "threads", label: channelLabel("THREADS_POST"), blurb: "Posts", filter: "THREADS_POST" },
] as const satisfies readonly { key: string; label: string; blurb: string; filter: string }[];
export type SocialRow = (typeof SOCIAL_ROWS)[number];

/** A channel filter's short name for a heading: a row's name ("Meta", "Instagram"), else the channel's label. */
export const channelName = (filter: string): string => SOCIAL_ROWS.find((r) => r.filter === filter)?.label ?? channelLabel(filter);

/** A row's posts awaiting approval (summed over its channels) and its earliest next post. */
export function rowSummary(summary: readonly ChannelSummary[], filter: string): { awaiting: number; next: NextPost | null } {
  const lines = summary.filter((s) => channelsOf(filter).includes(s.channel));
  let next: NextPost | null = null;
  for (const l of lines) if (l.next && (!next || new Date(l.next.scheduledFor).getTime() < new Date(next.scheduledFor).getTime())) next = l.next;
  return { awaiting: lines.reduce((n, l) => n + l.awaiting, 0), next };
}

export type ConnectionLine = { provider: Provider; name: string; tone: Tone; label: string };

/**
 * Each of a row's connections as a badge: none → "Not connected"; any account not working → "Needs reconnect" (the worst
 * wins when a provider has several); else "Connected". `names`: the providers' labels from GET connections.
 * "byHand": the row has no publishing connection (LinkedIn, X).
 */
export function connectionLines(providers: readonly Provider[], connections: readonly Connection[], names: ReadonlyMap<string, string>): ConnectionLine[] | "byHand" {
  if (!providers.length) return "byHand";
  return providers.map((provider) => {
    const mine = connections.filter((c) => c.provider === provider);
    const name = names.get(provider) ?? provider;
    if (!mine.length) return { provider, name, tone: "muted", label: "Not connected" };
    return { provider, name, ...connectionBadge(mine.find((c) => c.status !== "ACTIVE")?.status ?? "ACTIVE") };
  });
}

export type ConnectionKind = "connected" | "partial" | "reconnect" | "none" | "manual";
/** A channel's connection as one state, with the per-connection lines behind it (none when posted by hand). */
export type ConnectionState = { kind: ConnectionKind; label: string; tone: Tone; lines: ConnectionLine[] };

/**
 * One state from a channel's connections (GET connections), so the Meta and Instagram rows and a channel's calendar
 * read the same records: no connection to publish through → Manual publishing; every connection working → Connected;
 * some working → Partially connected (Meta with only one of Facebook Pages and Instagram); none working but one on
 * record → Needs reconnect; else Not connected.
 */
export function connectionState(providers: readonly Provider[], connections: readonly Connection[], names: ReadonlyMap<string, string>): ConnectionState {
  const lines = connectionLines(providers, connections, names);
  if (lines === "byHand") return { kind: "manual", label: "Manual publishing", tone: "muted", lines: [] };
  const good = lines.filter((l) => l.tone === "good").length;
  if (good === lines.length) return { kind: "connected", label: "Connected", tone: "good", lines };
  if (good) return { kind: "partial", label: "Partially connected", tone: "warn", lines };
  if (lines.some((l) => l.tone === "bad")) return { kind: "reconnect", label: "Needs reconnect", tone: "bad", lines };
  return { kind: "none", label: "Not connected", tone: "muted", lines };
}

/** Every connection a channel row publishes through (Facebook Pages, Instagram, Pinterest, Threads). */
const SOCIAL_PROVIDERS: ReadonlySet<Provider> = new Set(SOCIAL_ROWS.flatMap((r) => providersOf(r.filter)));

/**
 * The page's three figures. `accounts`: working accounts on the channels' connections (null when the role can't see
 * connections or they haven't loaded). `scheduled`: posts in the calendar's list with status Scheduled, as its Scheduled
 * filter counts them. `awaiting`: posts awaiting approval on every channel, from GET content/summary (the whole table,
 * not the list's window). Summed per channel, never per row: the Meta and Instagram rows share Instagram's posts.
 */
export function landingCounts(summary: readonly ChannelSummary[], items: readonly Pick<CalendarItem, "status">[], connections: readonly Connection[] | null) {
  const scheduled: readonly string[] = STATUS_GROUPS.scheduled;
  return {
    accounts: connections ? connections.filter((c) => SOCIAL_PROVIDERS.has(c.provider) && c.status === "ACTIVE").length : null,
    scheduled: items.filter((i) => scheduled.includes(i.status)).length,
    awaiting: summary.reduce((n, s) => n + s.awaiting, 0),
  };
}

type Listed = Pick<CalendarItem, "id" | "status" | "scheduledFor">;
const UPCOMING: readonly string[] = OPEN_STATUSES.filter((s) => s !== "BLOCKED" && s !== "AWAITING_APPROVAL");
const at = (i: Listed) => (i.scheduledFor ? new Date(i.scheduledFor).getTime() : Infinity);

/**
 * The page's short lists under the channels: posts awaiting approval (soonest first, undated last) and the next dated
 * posts that can still go out (open, not blocked, from now on; those awaiting approval are in the first list, so not
 * repeated). At most `n` each.
 */
export function attentionPosts<T extends Listed>(items: readonly T[], now: Date, n = 5): { awaiting: T[]; upcoming: T[] } {
  const awaitingStatus: readonly string[] = STATUS_GROUPS.awaiting;
  const awaiting = items.filter((i) => awaitingStatus.includes(i.status)).sort((a, b) => at(a) - at(b));
  const upcoming = items.filter((i) => UPCOMING.includes(i.status) && at(i) >= now.getTime() && at(i) < Infinity).sort((a, b) => at(a) - at(b));
  return { awaiting: awaiting.slice(0, n), upcoming: upcoming.slice(0, n) };
}

/**
 * A channel calendar's counts over the posts it has loaded, in the calendar's status groups: scheduled, awaiting approval
 * and published. `month` (the Month view's, local time): only posts dated in it; without it, every post given (the
 * List view's open posts and last 30 days of changes).
 */
export function channelCounts(items: readonly Pick<CalendarItem, "channel" | "status" | "scheduledFor">[], filter: string, month?: { y: number; m: number }) {
  const channels = channelsOf(filter);
  const inMonth = (iso: string | null) => {
    if (!month) return true;
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === month.y && d.getMonth() === month.m;
  };
  const mine = items.filter((i) => channels.includes(i.channel) && inMonth(i.scheduledFor));
  const count = (group: readonly string[]) => mine.filter((i) => group.includes(i.status)).length;
  return { scheduled: count(STATUS_GROUPS.scheduled), awaiting: count(STATUS_GROUPS.awaiting), published: count(STATUS_GROUPS.published) };
}
