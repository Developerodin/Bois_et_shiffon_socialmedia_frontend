"use client";

import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, Hand, Plug } from "lucide-react";
import {
  FacebookMark,
  InstagramMark,
  LinkedInMark,
  PinterestMark,
  ThreadsMark,
  XMark,
} from "@/components/icons/brand-marks";
import {
  ApiError,
  request,
  type Connection,
  type Provider,
} from "@/components/settings/api";
import {
  useChannelConnections,
  type Conns,
} from "@/components/social/channel-connection";
import { DayBars, dayLabel } from "@/components/data/day-bars";
import { Button } from "@/components/ui/button";
import { calendarHref } from "@/lib/calendar-filter";
import { cn } from "@/lib/utils";
import type {
  ChannelAnalyticsDto,
  ChannelDayDto,
  ChannelPostDto,
} from "@/shared";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;
type Metric = { key: string; label: string; hint?: string };
type Series = {
  label: string;
  what: string;
  pick: (a: ChannelAnalyticsDto) => ChannelDayDto[] | null;
};
/** An account the page reads from its platform (`read`), or one posted by hand (`byHand`, no numbers to read). */
type Account = {
  id: string;
  label: string;
  icon: Icon;
  provider: Provider | null;
  calendar: string;
  /** Read by GET insights/channel. Off until the server reads that platform. */
  read: boolean;
  tiles: Metric[];
  more?: Metric[];
  series: Series[];
};

const daily: Series["pick"] = (a) => a.daily;
const engagementsDaily: Series["pick"] = (a) => a.dailyEngagements;
const followersDaily: Series["pick"] = (a) =>
  a.followersDaily.length ? a.followersDaily : null;

/** The channels in the rail, in order. Totals keys are the server's (shared/data-sources.ts ChannelAnalyticsDto). */
export const ACCOUNTS: Account[] = [
  {
    id: "instagram",
    label: "Instagram",
    icon: InstagramMark,
    provider: "INSTAGRAM",
    calendar: calendarHref({ channel: "instagram" }),
    read: true,
    tiles: [
      {
        key: "reach",
        label: "Accounts reached",
        hint: "Unique accounts that saw your content",
      },
      {
        key: "views",
        label: "Views",
        hint: "Times your content was shown or played",
      },
      {
        key: "interactions",
        label: "Interactions",
        hint: "Likes, comments, shares, saves and replies",
      },
      {
        key: "newFollowers",
        label: "New followers",
        hint: "Follows over the period",
      },
    ],
    more: [
      { key: "accountsEngaged", label: "Accounts engaged" },
      { key: "likes", label: "Likes" },
      { key: "comments", label: "Comments" },
      { key: "shares", label: "Shares" },
      { key: "saves", label: "Saves" },
      { key: "linkTaps", label: "Link taps" },
    ],
    series: [
      { label: "Reach", what: "accounts reached", pick: daily },
      { label: "New followers", what: "new followers", pick: followersDaily },
    ],
  },
  {
    id: "facebook",
    label: "Facebook Page",
    icon: FacebookMark,
    provider: "META",
    calendar: calendarHref({ channel: "FACEBOOK_POST" }),
    read: true,
    tiles: [
      {
        key: "views",
        label: "Media views",
        hint: "Times your posts' media was shown",
      },
      {
        key: "engagements",
        label: "Post engagements",
        hint: "Reactions, comments, shares and clicks",
      },
      { key: "pageViews", label: "Page views", hint: "Visits to the Page" },
      {
        key: "newFollowers",
        label: "New followers",
        hint: "Follows over the period",
      },
    ],
    series: [
      { label: "Media views", what: "media views", pick: daily },
      {
        label: "Engagements",
        what: "post engagements",
        pick: engagementsDaily,
      },
      { label: "New followers", what: "new followers", pick: followersDaily },
    ],
  },
  {
    id: "pinterest",
    label: "Pinterest",
    icon: PinterestMark,
    provider: "PINTEREST",
    calendar: calendarHref({ channel: "PINTEREST_PIN" }),
    read: false,
    tiles: [
      {
        key: "impressions",
        label: "Impressions",
        hint: "Times your Pins were shown",
      },
      {
        key: "engagements",
        label: "Engagements",
        hint: "Saves, clicks and close-ups",
      },
      { key: "saves", label: "Saves" },
      {
        key: "outboundClicks",
        label: "Outbound clicks",
        hint: "Clicks through to your site",
      },
    ],
    more: [{ key: "pinClicks", label: "Pin clicks" }],
    series: [
      { label: "Impressions", what: "impressions", pick: daily },
      { label: "Engagements", what: "engagements", pick: engagementsDaily },
    ],
  },
  {
    id: "threads",
    label: "Threads",
    icon: ThreadsMark,
    provider: "THREADS",
    calendar: calendarHref({ channel: "THREADS_POST" }),
    read: false,
    tiles: [
      { key: "views", label: "Views" },
      { key: "likes", label: "Likes" },
      { key: "comments", label: "Replies" },
      { key: "shares", label: "Reposts" },
    ],
    more: [{ key: "quotes", label: "Quotes" }],
    series: [{ label: "Views", what: "views", pick: daily }],
  },
  {
    id: "linkedin",
    label: "LinkedIn",
    icon: LinkedInMark,
    provider: null,
    calendar: calendarHref({ channel: "LINKEDIN_POST" }),
    read: false,
    tiles: [],
    series: [],
  },
  {
    id: "x",
    label: "X",
    icon: XMark,
    provider: null,
    calendar: calendarHref({ channel: "X_POST" }),
    read: false,
    tiles: [],
    series: [],
  },
];

const RANGES = [7, 14, 28] as const;
const n = (v: number | null | undefined) =>
  v == null ? "—" : v.toLocaleString();

// One read per account and range for the page's life: switching back is instant (the server caches 15 minutes too).
const cache = new Map<string, Promise<ChannelAnalyticsDto>>();
function load(base: string, id: string, days: number) {
  const key = `${base}|${id}|${days}`;
  let p = cache.get(key);
  if (!p) {
    p = request<ChannelAnalyticsDto>(
      `${base}/insights/channel?channel=${id}&days=${days}`,
    );
    // A failure isn't kept: the next look asks again.
    p.catch(() => cache.get(key) === p && cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

type Load =
  | { kind: "loading" }
  | { kind: "ready"; data: ChannelAnalyticsDto }
  | { kind: "error"; message: string };
function useAnalytics(
  base: string,
  id: string,
  days: number,
  on: boolean,
): [Load, () => void] {
  const [state, setState] = useState<Load>({ kind: "loading" });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!on) return;
    let live = true;
    setState({ kind: "loading" });
    load(base, id, days).then(
      (data) => live && setState({ kind: "ready", data }),
      (e: unknown) =>
        live &&
        setState({
          kind: "error",
          message:
            e instanceof ApiError
              ? e.message
              : "Couldn't read these numbers. Try again.",
        }),
    );
    return () => {
      live = false;
    };
  }, [base, id, days, on, nonce]);
  return [state, useCallback(() => setNonce((x) => x + 1), [])];
}

/** The account's working connection name ("@handle", the Page), or null when it isn't connected. */
function connected(
  conns: Conns,
  provider: Provider | null,
): { name: string | null; state: "on" | "off" | "broken" | "unknown" } {
  if (!provider) return { name: null, state: "off" };
  if (!conns || typeof conns !== "object")
    return { name: null, state: "unknown" };
  const mine = conns.list.filter((c: Connection) => c.provider === provider);
  const on = mine.find((c) => c.status === "ACTIVE");
  if (on) return { name: on.displayName, state: "on" };
  return { name: null, state: mine.length ? "broken" : "off" };
}

/**
 * The Analytics page (/social/analytics): a rail of the brand's channels and the chosen one's numbers. The choice and
 * the range live in the URL (?account=, ?days=) without a page load, so switching is one click; each account's read is
 * kept for the page's life. Facebook Page and Instagram (and Pinterest and Threads once the server reads them) come live
 * from the platform; LinkedIn and X are posted by hand, so there is nothing to read.
 */
export function AnalyticsView({
  base,
  workspaceId,
  brandId,
  canSeeConnections,
  account,
  days: startDays,
}: {
  base: string;
  workspaceId: string;
  brandId: string;
  canSeeConnections: boolean;
  account: string;
  days: number;
}) {
  const conns = useChannelConnections(workspaceId, brandId, canSeeConnections);
  const [id, setId] = useState(() =>
    ACCOUNTS.some((a) => a.id === account) ? account : "instagram",
  );
  const [days, setDays] = useState<number>(() =>
    (RANGES as readonly number[]).includes(startDays) ? startDays : 28,
  );
  // The URL follows the choice (shareable, back-button safe) without a navigation.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("account", id);
      if (days === 28) u.searchParams.delete("days");
      else u.searchParams.set("days", String(days));
      window.history.replaceState(window.history.state, "", u);
    } catch {
      // ignore
    }
  }, [id, days]);
  const acct = ACCOUNTS.find((a) => a.id === id)!;

  return (
    // The wrapper is the container: a container query reads an ancestor, never the element itself.
    <div className="@container/an">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 @min-[52rem]/an:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Channels" className="min-w-0">
          <ul className="grid grid-cols-2 gap-1.5 @min-[36rem]/an:grid-cols-3 @min-[52rem]/an:grid-cols-1">
            {ACCOUNTS.map((a) => {
              const c = connected(conns, a.provider);
              const on = a.id === id;
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    aria-current={on ? "page" : undefined}
                    onClick={() => setId(a.id)}
                    className={cn(
                      "flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      on
                        ? "border-foreground/15 bg-card shadow-sm"
                        : "border-transparent hover:bg-card/70",
                    )}
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent">
                      <a.icon aria-hidden className="size-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span
                        className={cn(
                          "block truncate text-sm",
                          on && "font-medium",
                        )}
                      >
                        {a.label}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {!a.provider
                          ? "Published by hand"
                          : c.state === "on"
                            ? c.name
                            : c.state === "broken"
                              ? "Needs reconnect"
                              : c.state === "off"
                                ? "Not connected"
                                : " "}
                      </span>
                    </span>
                    {on && (
                      <ChevronRight
                        aria-hidden
                        className="hidden size-4 shrink-0 text-muted-foreground @min-[52rem]/an:block"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <section
          aria-label={`${acct.label} analytics`}
          className="flex min-w-0 flex-col gap-4"
        >
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-card shadow-sm">
                <acct.icon aria-hidden className="size-5" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-lg font-semibold leading-tight">
                  {acct.label}
                </h2>
                <p className="truncate text-xs text-muted-foreground">
                  {acct.provider
                    ? (connected(conns, acct.provider).name ?? " ")
                    : "Published by hand"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {acct.read && (
                <div
                  role="radiogroup"
                  aria-label="Period"
                  className="inline-flex rounded-full border border-border bg-card p-0.5"
                >
                  {RANGES.map((r) => (
                    <button
                      key={r}
                      type="button"
                      role="radio"
                      aria-checked={days === r}
                      onClick={() => setDays(r)}
                      className={cn(
                        "h-7 rounded-full px-3 text-xs tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        days === r
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {r} days
                    </button>
                  ))}
                </div>
              )}
              <Button asChild size="sm" variant="outline">
                <Link href={acct.calendar}>Open calendar</Link>
              </Button>
            </div>
          </header>

          {/* key: another account or range is a fresh panel, never the last one's numbers for a moment. */}
          <div className="@container/panel">
            <AccountPanel
              key={`${acct.id}:${days}`}
              base={base}
              acct={acct}
              days={days}
              conn={connected(conns, acct.provider).state}
            />
          </div>
        </section>
      </div>
    </div>
  );
}

function Empty({
  icon: I,
  title,
  children,
  action,
}: {
  icon: Icon;
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-6">
      <span className="grid size-10 place-items-center rounded-full bg-accent">
        <I aria-hidden className="size-5" />
      </span>
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">
          {children}
        </p>
      </div>
      {action}
    </div>
  );
}

function AccountPanel({
  base,
  acct,
  days,
  conn,
}: {
  base: string;
  acct: Account;
  days: number;
  conn: "on" | "off" | "broken" | "unknown";
}) {
  const [state, reload] = useAnalytics(base, acct.id, days, acct.read);
  const [series, setSeries] = useState(0);

  if (!acct.provider) {
    return (
      <Empty
        icon={Hand}
        title={`${acct.label} has no analytics to read`}
        action={
          <Button asChild size="sm" variant="outline">
            <Link href={acct.calendar}>Plan {acct.label} posts</Link>
          </Button>
        }
      >
        {acct.label} posts are published by hand, so {acct.label} sends us no
        numbers. Check them in {acct.label}&apos;s own analytics.
      </Empty>
    );
  }
  if (conn === "off" || conn === "broken") {
    return (
      <Empty
        icon={Plug}
        title={
          conn === "broken"
            ? `Reconnect ${acct.label}`
            : `Connect ${acct.label}`
        }
        action={
          <Button asChild size="sm">
            <Link href="/connections">
              {conn === "broken" ? "Reconnect" : "Connect"} {acct.label}
            </Link>
          </Button>
        }
      >
        {conn === "broken"
          ? `${acct.label}'s access has stopped working, so its numbers can't be read.`
          : `Once ${acct.label} is connected, its numbers show here.`}
      </Empty>
    );
  }
  if (!acct.read) {
    return (
      <Empty icon={Plug} title={`${acct.label} is connected`}>
        Its numbers are being added to this page. Until then, {acct.label}
        &apos;s own analytics have them.
      </Empty>
    );
  }
  if (state.kind === "loading") return <PanelSkeleton />;
  if (state.kind === "error") {
    return (
      <Empty
        icon={Plug}
        title="Couldn't read these numbers"
        action={
          <Button size="sm" variant="outline" onClick={reload}>
            Try again
          </Button>
        }
      >
        {state.message}
      </Empty>
    );
  }
  const a = state.data;
  if (a.state !== "ok" || !a.account) {
    return (
      <Empty
        icon={Plug}
        title={
          a.state === "reconnect"
            ? `Reconnect ${acct.label}`
            : `Connect ${acct.label}`
        }
        action={
          <Button asChild size="sm">
            <Link href="/connections">Open Connections</Link>
          </Button>
        }
      >
        {a.state === "reconnect"
          ? `${acct.label}'s access has stopped working, so its numbers can't be read.`
          : `Once ${acct.label} is connected, its numbers show here.`}
      </Empty>
    );
  }

  const t = a.totals;
  const shown = acct.series
    .map((s) => ({ ...s, days: s.pick(a) }))
    .filter((s) => s.days && s.days.length);
  const pick = shown[Math.min(series, shown.length - 1)];
  const more = (acct.more ?? []).filter((m) => t[m.key] != null);
  return (
    <div className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-3 @min-[34rem]/panel:grid-cols-3 @min-[46rem]/panel:grid-cols-5">
        <Tile
          label="Followers"
          value={a.account.followers}
          hint={
            a.account.posts != null
              ? `${a.account.posts.toLocaleString()} posts`
              : undefined
          }
        />
        {acct.tiles.map((m) => (
          <Tile
            key={m.key}
            label={m.label}
            value={t[m.key] ?? null}
            hint={m.hint}
          />
        ))}
      </dl>
      {more.length > 0 && (
        <p className="flex flex-wrap gap-x-5 gap-y-1 px-1 text-sm text-muted-foreground">
          {more.map((m) => (
            <span key={m.key}>
              <span className="font-medium tabular-nums text-foreground">
                {n(t[m.key])}
              </span>{" "}
              {m.label.toLowerCase()}
            </span>
          ))}
        </p>
      )}

      {pick && (
        <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium">
              {pick.label} per day{" "}
              <span className="font-normal text-muted-foreground">
                &middot; {dayLabel(a.from)} – {dayLabel(a.to)}
              </span>
            </p>
            {shown.length > 1 && (
              <div
                role="radiogroup"
                aria-label="Chart"
                className="inline-flex rounded-full border border-border p-0.5"
              >
                {shown.map((s, i) => (
                  <button
                    key={s.label}
                    type="button"
                    role="radio"
                    aria-checked={s === pick}
                    onClick={() => setSeries(i)}
                    className={cn(
                      "h-7 rounded-full px-3 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      s === pick
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <DayBars
            key={pick.label}
            days={pick.days!}
            what={pick.what}
            title={`${pick.label} per day`}
            caption={false}
          />
        </div>
      )}

      {a.countries?.length || a.posts?.length ? (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 @min-[56rem]/panel:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
          {a.countries && a.countries.length > 0 && (
            <Countries
              countries={a.countries}
              followers={a.account.followers}
            />
          )}
          {a.posts && a.posts.length > 0 && <TopPosts posts={a.posts} />}
        </div>
      ) : null}

      <p className="px-1 text-xs text-muted-foreground">
        Read from{" "}
        {acct.id === "facebook" || acct.id === "instagram"
          ? "Meta"
          : acct.label}{" "}
        {new Date(a.readAt).toLocaleTimeString(undefined, {
          hour: "2-digit",
          minute: "2-digit",
        })}
        ; numbers can lag a day.
        {acct.id === "facebook" &&
          " Numbers for each Page post need a Facebook permission the app doesn't have yet."}
        {a.partial &&
          " Some numbers didn't arrive in time and show as —; they come on the next read."}
      </p>
    </div>
  );
}

function Tile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint?: string;
}) {
  return (
    <div
      className="min-w-0 rounded-2xl border border-border bg-card px-4 py-3"
      title={hint}
    >
      <dt className="truncate text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 truncate text-2xl font-semibold leading-tight tracking-tight tabular-nums">
        {n(value)}
      </dd>
      {hint && (
        <dd className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
          {hint}
        </dd>
      )}
    </div>
  );
}

const REGION = (() => {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" });
  } catch {
    return null;
  }
})();
const country = (code: string) => {
  try {
    return REGION?.of(code) ?? code;
  } catch {
    return code;
  }
};

function Countries({
  countries,
  followers,
}: {
  countries: { country: string; followers: number }[];
  followers: number | null;
}) {
  const top = Math.max(...countries.map((c) => c.followers), 1);
  return (
    <div className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <p className="mb-3 text-sm font-medium">Followers by country</p>
      <ol className="flex flex-col gap-2.5">
        {countries.map((c) => (
          <li key={c.country} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate">{country(c.country)}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {c.followers.toLocaleString()}
                {followers ? (
                  <span className="ml-1.5 text-xs">
                    {Math.round((c.followers / followers) * 100)}%
                  </span>
                ) : null}
              </span>
            </div>
            <div
              className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"
              aria-hidden
            >
              <div
                className="h-full rounded-full bg-[var(--chart-1)]"
                style={{ width: `${(c.followers / top) * 100}%` }}
              />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

const TYPE: Record<string, string> = {
  REELS: "Reel",
  STORY: "Story",
  CAROUSEL_ALBUM: "Carousel",
  VIDEO: "Video",
  IMAGE: "Photo",
};
const postType = (p: ChannelPostDto) =>
  p.productType === "REELS" || p.productType === "STORY"
    ? TYPE[p.productType]
    : (TYPE[p.mediaType ?? ""] ?? "Post");

function TopPosts({ posts }: { posts: ChannelPostDto[] }) {
  const top = [...posts]
    .sort((x, y) => (y.metrics?.reach ?? -1) - (x.metrics?.reach ?? -1))
    .slice(0, 5);
  const COLS =
    "grid grid-cols-[1.25rem_minmax(0,1fr)] gap-x-3 @min-[40rem]/panel:grid-cols-[1.25rem_minmax(0,1fr)_4.5rem_3.5rem_4.5rem_3.5rem]";
  return (
    <div className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <p className="mb-1 text-sm font-medium">Top posts</p>
      <p className="mb-3 text-xs text-muted-foreground">
        Your latest {posts.length} posts, by accounts reached since posting
      </p>
      <div
        aria-hidden
        className={cn(
          COLS,
          "hidden border-b border-border pb-2 text-xs text-muted-foreground @min-[40rem]/panel:grid",
        )}
      >
        <span />
        <span>Post</span>
        <span className="text-right">Reached</span>
        <span className="text-right">Likes</span>
        <span className="text-right">Comments</span>
        <span className="text-right">Saves</span>
      </div>
      <ol className="divide-y divide-border">
        {top.map((p, i) => (
          <li key={p.id} className={cn(COLS, "items-center py-2.5")}>
            <span className="text-sm tabular-nums text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="line-clamp-2 text-sm">
                {p.caption ?? "No caption"}
              </p>
              <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{postType(p)}</span>
                {p.postedAt && (
                  <span>&middot; {dayLabel(p.postedAt.slice(0, 10))}</span>
                )}
                {p.permalink && (
                  <a
                    href={p.permalink}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-0.5 rounded hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    &middot; Open{" "}
                    <ArrowUpRight aria-hidden className="size-3" />
                  </a>
                )}
                {/* Narrow: the numbers on the post's own line. */}
                <span className="tabular-nums @min-[40rem]/panel:hidden">
                  &middot; {n(p.metrics?.reach)} reached
                </span>
              </p>
            </div>
            <span className="hidden text-right text-sm font-medium tabular-nums @min-[40rem]/panel:block">
              {n(p.metrics?.reach)}
            </span>
            <span className="hidden text-right text-sm tabular-nums @min-[40rem]/panel:block">
              {n(p.metrics?.likes)}
            </span>
            <span className="hidden text-right text-sm tabular-nums @min-[40rem]/panel:block">
              {n(p.metrics?.comments)}
            </span>
            <span className="hidden text-right text-sm tabular-nums @min-[40rem]/panel:block">
              {n(p.metrics?.saves)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PanelSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading numbers"
      className="flex flex-col gap-4"
    >
      <div className="grid grid-cols-2 gap-3 @min-[34rem]/panel:grid-cols-3 @min-[46rem]/panel:grid-cols-5">
        {Array.from({ length: 5 }, (_, i) => (
          <div
            key={i}
            className="h-[5.5rem] animate-pulse rounded-2xl bg-muted"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
