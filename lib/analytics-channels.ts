import type { Provider } from "@/components/settings/api";
import { calendarHref } from "@/lib/calendar-filter";
import type { AnalyticsChannel, ChannelAnalyticsDto, ChannelDayDto, ChannelPostDto, PostMetricsDto } from "@/shared";

/**
 * The Analytics page's channels and the pure rules its panels follow: what each channel shows (its figures, charts and
 * top-posts columns, all keys of GET insights/channel, shared/data-sources.ts ChannelAnalyticsDto), which state a
 * channel is in, which figures can be set against the previous period, and how top posts sort. No React here, so it is
 * checked without rendering (tests/analytics-channels.test.ts).
 */

export type ChannelId = AnalyticsChannel | "linkedin" | "x";
/** A figure: a totals key, its name, and one short line on what it counts (shown under the number, never cut). */
export type Metric = { key: string; label: string; hint: string };
export type SeriesKey = "daily" | "dailyEngagements" | "followersDaily";
export type SeriesSpec = { key: SeriesKey; label: string; what: string };
export type PostColumn = { key: keyof PostMetricsDto; label: string };
/**
 * Top posts: the columns shown (the first ranks them by default), the numbers they can be sorted by (a sort outside the
 * columns shows as an extra first column), a post's name, and what the numbers cover.
 */
export type PostSpec = { cols: PostColumn[]; sorts: PostColumn[]; noun: string; plural: string; window: string };

type Base = { id: ChannelId; label: string; calendar: string };
export type ReadChannel = Base & {
  kind: "read";
  id: AnalyticsChannel;
  provider: Provider;
  /** Who the numbers come from, for the freshness line. */
  source: string;
  tiles: Metric[];
  /** Smaller figures under the main ones (an engagement breakdown), shown only when the platform sent them. */
  more: Metric[];
  series: SeriesSpec[];
  posts?: PostSpec;
  /** What connecting the account makes appear here, for the connect state. */
  gains: string[];
};
export type ManualChannel = Base & {
  kind: "manual";
  /** The calendar's channel value of its posts (GET content items' `channel`). */
  postChannel: string;
  /** How a post goes out today, in a sentence. */
  workflow: string;
};
export type Channel = ReadChannel | ManualChannel;

const FOLLOWS: Metric = { key: "newFollowers", label: "New followers", hint: "Follows over the period" };

/** The channels in the rail, in order. */
export const CHANNELS: readonly Channel[] = [
  {
    kind: "read",
    id: "instagram",
    label: "Instagram",
    provider: "INSTAGRAM",
    calendar: calendarHref({ channel: "instagram" }),
    source: "Meta",
    tiles: [
      { key: "reach", label: "Accounts reached", hint: "Unique accounts that saw your content" },
      { key: "views", label: "Views", hint: "Times your content was shown or played" },
      { key: "interactions", label: "Interactions", hint: "Likes, comments, shares, saves and replies" },
      FOLLOWS,
    ],
    more: [
      { key: "accountsEngaged", label: "Accounts engaged", hint: "Unique accounts that interacted" },
      { key: "likes", label: "Likes", hint: "" },
      { key: "comments", label: "Comments", hint: "" },
      { key: "shares", label: "Shares", hint: "" },
      { key: "saves", label: "Saves", hint: "" },
      { key: "linkTaps", label: "Link taps", hint: "Taps on the link in your profile" },
    ],
    series: [
      { key: "daily", label: "Reach", what: "accounts reached" },
      { key: "followersDaily", label: "New followers", what: "new followers" },
    ],
    posts: {
      cols: [
        { key: "reach", label: "Reached" },
        { key: "likes", label: "Likes" },
        { key: "comments", label: "Comments" },
        { key: "saves", label: "Saves" },
      ],
      sorts: [
        { key: "reach", label: "Reached" },
        { key: "views", label: "Views" },
        { key: "interactions", label: "Interactions" },
        { key: "saves", label: "Saves" },
        { key: "likes", label: "Likes" },
        { key: "comments", label: "Comments" },
      ],
      noun: "Post",
      plural: "posts",
      window: "Your latest posts, numbers since each was posted",
    },
    gains: ["Followers, reach, views and interactions", "Reach and new followers per day", "Followers by country", "Your latest posts and how each did"],
  },
  {
    kind: "read",
    id: "facebook",
    label: "Facebook Page",
    provider: "META",
    calendar: calendarHref({ channel: "FACEBOOK_POST" }),
    source: "Meta",
    tiles: [
      { key: "views", label: "Media views", hint: "Times your posts' media was shown" },
      { key: "engagements", label: "Post engagements", hint: "Reactions, comments, shares and clicks" },
      { key: "pageViews", label: "Page views", hint: "Visits to the Page" },
      FOLLOWS,
    ],
    more: [],
    series: [
      { key: "daily", label: "Media views", what: "media views" },
      { key: "dailyEngagements", label: "Engagements", what: "post engagements" },
      { key: "followersDaily", label: "New followers", what: "new followers" },
    ],
    gains: ["Followers, media views, engagements and Page views", "Media views, engagements and new followers per day"],
  },
  {
    kind: "read",
    id: "pinterest",
    label: "Pinterest",
    provider: "PINTEREST",
    calendar: calendarHref({ channel: "PINTEREST_PIN" }),
    source: "Pinterest",
    tiles: [
      { key: "impressions", label: "Impressions", hint: "Times your Pins were shown" },
      { key: "engagements", label: "Engagements", hint: "Saves, clicks and close-ups" },
      { key: "saves", label: "Saves", hint: "Pins saved to boards" },
      { key: "outboundClicks", label: "Outbound clicks", hint: "Clicks through to your site" },
    ],
    more: [
      { key: "pinClicks", label: "Pin clicks", hint: "" },
      { key: "monthlyViews", label: "Monthly views", hint: "Pinterest's own rolling 30 days" },
    ],
    series: [
      { key: "daily", label: "Impressions", what: "impressions" },
      { key: "dailyEngagements", label: "Engagements", what: "engagements" },
    ],
    posts: {
      cols: [
        { key: "views", label: "Impressions" },
        { key: "saves", label: "Saves" },
        { key: "interactions", label: "Engagements" },
      ],
      sorts: [
        { key: "views", label: "Impressions" },
        { key: "saves", label: "Saves" },
        { key: "interactions", label: "Engagements" },
      ],
      noun: "Pin",
      plural: "Pins",
      window: "Your most seen Pins, numbers over the period",
    },
    gains: ["Impressions, engagements, saves and outbound clicks", "Impressions and engagements per day", "Your most seen Pins"],
  },
  {
    kind: "read",
    id: "threads",
    label: "Threads",
    provider: "THREADS",
    calendar: calendarHref({ channel: "THREADS_POST" }),
    source: "Threads",
    tiles: [
      { key: "views", label: "Views", hint: "Times your posts were seen" },
      { key: "likes", label: "Likes", hint: "Likes on your posts" },
      { key: "comments", label: "Replies", hint: "Replies to your posts" },
      { key: "shares", label: "Reposts", hint: "Times your posts were reposted" },
    ],
    more: [{ key: "quotes", label: "Quotes", hint: "" }],
    series: [{ key: "daily", label: "Views", what: "views" }],
    gains: ["Followers, views, likes, replies and reposts", "Views per day"],
  },
  {
    kind: "manual",
    id: "linkedin",
    label: "LinkedIn",
    calendar: calendarHref({ channel: "LINKEDIN_POST" }),
    postChannel: "LINKEDIN_POST",
    workflow: "LinkedIn posts are planned here and published by hand on LinkedIn.",
  },
  {
    kind: "manual",
    id: "x",
    label: "X",
    calendar: calendarHref({ channel: "X_POST" }),
    postChannel: "X_POST",
    workflow: "Posts for X are planned here and published by hand on X.",
  },
];

export const channelById = (id: string): Channel | undefined => CHANNELS.find((c) => c.id === id);

export const RANGES = [7, 14, 28] as const;
export type Range = (typeof RANGES)[number];

/** "—" for a number the platform didn't give; a real 0 stays 0. */
export const fmt = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());

/**
 * Totals that are counts of events, so a longer period's total minus a shorter one's is the days in between. Unique
 * counts (reach, accounts engaged), follower counts and Pinterest's rolling monthly views are never compared that way.
 */
export const ADDITIVE: ReadonlySet<string> = new Set([
  "views", "impressions", "interactions", "likes", "comments", "shares", "saves", "engagements", "newFollowers", "pageViews",
  "outboundClicks", "pinClicks", "quotes", "linkTaps",
]);

/** Whether a period has a previous one to compare with: twice it must stay within the platforms' 30-day window. */
export const comparable = (days: number) => days * 2 <= 28;

/** The previous equal period's total and the change against it (a fraction; null when the previous total was 0). */
export type Comparison = { previous: number; change: number | null };

/**
 * The previous period for one figure, from two reads ending on the same day: this period (`cur`, N days) and twice it
 * (`wide`, 2N days). previous = wide − cur, for ADDITIVE keys only. Null whenever it can't be said truthfully: the key
 * isn't additive, the period is too long, a read is partial or not ok, the two reads end on different days (they
 * straddled midnight UTC, or one came from the server's cache), the latest days are still being counted, a number is
 * missing, or the subtraction goes negative.
 */
export function previousPeriod(cur: ChannelAnalyticsDto, wide: ChannelAnalyticsDto | null | undefined, key: string): Comparison | null {
  if (!wide || !ADDITIVE.has(key) || !comparable(cur.days) || wide.days !== cur.days * 2) return null;
  if (cur.state !== "ok" || wide.state !== "ok" || cur.partial || wide.partial || cur.to !== wide.to || cur.channel !== wide.channel) return null;
  // Days still being counted (Pinterest's latest) leave this period short against a complete previous one.
  if (pendingTail(cur.daily) > 0 || pendingTail(wide.daily) > 0) return null;
  const now = cur.totals[key];
  const both = wide.totals[key];
  if (now == null || both == null) return null;
  const previous = both - now;
  if (previous < 0) return null;
  return { previous, change: previous === 0 ? null : (now - previous) / previous };
}

/** "+12%", "−8%", "0%"; rounded to a whole percent (one decimal under 10 %). */
export function changeLabel(change: number): string {
  const pct = change * 100;
  const r = Math.abs(pct) < 10 ? Math.round(pct * 10) / 10 : Math.round(pct);
  if (r === 0) return "0%";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString()}%`;
}

export type ConnState = "on" | "off" | "broken" | "unknown";
export type Load = { kind: "loading" } | { kind: "ready"; data: ChannelAnalyticsDto } | { kind: "error"; message: string };

/**
 * What a channel's panel shows:
 * - manual: published by hand, nothing to read;
 * - disconnected / reconnect: no working connection (from Connections, or from the read itself);
 * - loading / error: the read is under way or failed (a retry is offered);
 * - incomplete: nothing arrived because reads timed out or were rate limited (temporary: try again);
 * - unavailable: connected, but the platform refused every number (a missing analytics permission);
 * - pending: connected, every day is still being counted (Pinterest marks recent days not ready);
 * - ok: numbers to show; `pendingDays` recent days are still being counted.
 */
export type PanelState =
  | { kind: "manual" }
  | { kind: "disconnected" }
  | { kind: "reconnect" }
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "incomplete"; data: ChannelAnalyticsDto }
  | { kind: "unavailable"; data: ChannelAnalyticsDto }
  | { kind: "pending"; data: ChannelAnalyticsDto }
  | { kind: "ok"; data: ChannelAnalyticsDto; pendingDays: number };

/**
 * Totals that aren't read over the period: Pinterest's monthly views come with the account, not its analytics, so they
 * arrive even when every analytics read was refused and say nothing about whether the period was read.
 */
const ACCOUNT_FIGURES: ReadonlySet<string> = new Set(["monthlyViews"]);

/** Whether any figure over the period or any day has a number (a 0 counts: it is a real number). */
function hasNumbers(a: ChannelAnalyticsDto): boolean {
  return Object.entries(a.totals).some(([k, v]) => v != null && !ACCOUNT_FIGURES.has(k)) || a.daily.some((d) => d.value != null) || (a.dailyEngagements ?? []).some((d) => d.value != null);
}

/** How many days at the end of a series have no number yet (Pinterest's days still being counted). */
export function pendingTail(days: readonly ChannelDayDto[]): number {
  let n = 0;
  for (let i = days.length - 1; i >= 0 && days[i].value === null; i--) n++;
  return n;
}

export function panelState(channel: Channel, conn: ConnState, load: Load): PanelState {
  if (channel.kind === "manual") return { kind: "manual" };
  if (conn === "off") return { kind: "disconnected" };
  if (conn === "broken") return { kind: "reconnect" };
  if (load.kind === "loading") return { kind: "loading" };
  if (load.kind === "error") return { kind: "error", message: load.message };
  const a = load.data;
  if (a.state === "reconnect") return { kind: "reconnect" };
  if (a.state !== "ok" || !a.account) return { kind: "disconnected" };
  if (!hasNumbers(a)) {
    if (a.partial) return { kind: "incomplete", data: a };
    // Days listed but none counted yet: the platform is still preparing them. No days at all: it refused the read.
    return a.daily.length > 0 ? { kind: "pending", data: a } : { kind: "unavailable", data: a };
  }
  return { kind: "ok", data: a, pendingDays: pendingTail(a.daily) };
}

/** The read's daily series for a chart key, or null when the platform gave none. */
export function seriesOf(a: ChannelAnalyticsDto, key: SeriesKey): ChannelDayDto[] | null {
  const days = key === "daily" ? a.daily : key === "dailyEngagements" ? a.dailyEngagements : a.followersDaily;
  return days && days.length && days.some((d) => d.value !== null) ? days : null;
}

const withNumbers = (posts: readonly ChannelPostDto[], cols: readonly PostColumn[]) => cols.filter((c) => posts.some((p) => p.metrics?.[c.key] != null));

/** The sorts some post has a number for (sorting by a column of dashes means nothing), in the spec's order. */
export const postSorts = (posts: readonly ChannelPostDto[], spec: PostSpec): PostColumn[] => withNumbers(posts, spec.sorts);

/**
 * The columns to show for a sort: the spec's columns some post has a number for, with the sorted one first when it
 * isn't among them, so the number the list is ordered by is always on screen.
 */
export function postColumns(posts: readonly ChannelPostDto[], spec: PostSpec, sort: PostColumn): PostColumn[] {
  const cols = withNumbers(posts, spec.cols);
  return cols.some((c) => c.key === sort.key) ? cols : [sort, ...cols];
}

/** The top `n` posts by one number, highest first; posts without that number go last, in their given order. */
export function topPosts(posts: readonly ChannelPostDto[], key: keyof PostMetricsDto, n = 5): ChannelPostDto[] {
  return posts
    .map((p, i) => ({ p, i, v: p.metrics?.[key] ?? null }))
    .sort((x, y) => (x.v === null ? (y.v === null ? x.i - y.i : 1) : y.v === null ? -1 : y.v - x.v || x.i - y.i))
    .slice(0, n)
    .map((x) => x.p);
}
