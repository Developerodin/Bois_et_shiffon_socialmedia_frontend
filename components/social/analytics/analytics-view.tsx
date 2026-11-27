"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CloudOff, RefreshCw } from "lucide-react";
import type { Connection, Provider } from "@/components/settings/api";
import { useChannelConnections, type Conns } from "@/components/social/channel-connection";
import { Button } from "@/components/ui/button";
import { CHANNELS, channelById, fmt, panelState, previousPeriod, RANGES, seriesOf, type Channel, type ConnState, type PanelState, type Range, type ReadChannel } from "@/lib/analytics-channels";
import { clockTime } from "@/lib/time";
import type { ChannelAnalyticsDto } from "@/shared";
import { AnalyticsChartCard } from "./analytics-chart-card";
import { AnalyticsMetricCard, AnalyticsMetricGrid, AnalyticsMetricGridSkeleton } from "./analytics-metric-card";
import { AnalyticsDataNotice, AnalyticsEmptyState, PlatformConnectionState, StateList } from "./analytics-states";
import { AudienceInsights } from "./audience-insights";
import { ChannelAnalyticsHeader, type HeaderStatus } from "./channel-analytics-header";
import { CHANNEL_ICON } from "./channel-icons";
import { ChannelSidebar } from "./channel-sidebar";
import { DateRangeSelector } from "./date-range-selector";
import { ManualPublishingState } from "./manual-publishing-state";
import { TopPerformingPosts } from "./top-performing-posts";
import { useChannelAnalytics, useWideRead } from "./use-channel-analytics";

/** The account's working connection name ("@handle", the Page), or why there is none; "unknown" while loading or hidden. */
function connected(conns: Conns, provider: Provider | null): { name: string | null; state: ConnState } {
  if (!provider) return { name: null, state: "off" };
  if (!conns || typeof conns !== "object") return { name: null, state: "unknown" };
  const mine = conns.list.filter((c: Connection) => c.provider === provider);
  const on = mine.find((c) => c.status === "ACTIVE");
  if (on) return { name: on.displayName, state: "on" };
  return { name: null, state: mine.length ? "broken" : "off" };
}

/** The header's status pill: manual publishing, or the connection as the read (else Connections) says it is. */
function headerStatus(channel: Channel, conn: ConnState, s: PanelState): HeaderStatus | null {
  if (channel.kind === "manual") return { label: "Manual publishing", tone: "muted" };
  if (s.kind === "reconnect") return { label: "Needs reconnect", tone: "warn" };
  if (s.kind === "disconnected") return { label: "Not connected", tone: "muted" };
  if (conn === "on" || "data" in s) return { label: "Connected", tone: "good" };
  return null;
}

/**
 * The Analytics page (/social/analytics): a rail of the brand's channels and the chosen one's numbers, each channel on
 * the same frame (header, period, figures, chart, insights) filled with only what its platform gives. The choice and
 * the range live in the URL (?account=, ?days=) without a page load, so switching is one click, and each read is kept
 * for the page's life. Instagram, the Facebook Page, Pinterest and Threads come live from their platforms (GET
 * insights/channel); LinkedIn and X are posted by hand, so they show their publishing state instead.
 */
export function AnalyticsView({ base, workspaceId, brandId, canSeeConnections, account, days: startDays }: { base: string; workspaceId: string; brandId: string; canSeeConnections: boolean; account: string; days: number }) {
  const conns = useChannelConnections(workspaceId, brandId, canSeeConnections);
  const [id, setId] = useState(() => (channelById(account) ? account : "instagram"));
  const [days, setDays] = useState<Range>(() => (RANGES as readonly number[]).includes(startDays) ? (startDays as Range) : 28);
  // The address follows the choice (shareable, reload-safe) without a navigation.
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

  const channel = channelById(id)!;
  const provider = channel.kind === "read" ? channel.provider : null;
  const conn = connected(conns, provider);
  // Not read while the connection is known to be missing: the connect state says so without asking the platform.
  const [load, retry] = useChannelAnalytics(base, id, days, channel.kind === "read" && conn.state !== "off" && conn.state !== "broken");
  const state = panelState(channel, conn.state, load);
  const wide = useWideRead(base, id, days, state.kind === "ok" && state.pendingDays === 0);
  const data = "data" in state ? state.data : null;
  const Icon = CHANNEL_ICON[channel.id];
  const showRange = channel.kind === "read" && state.kind !== "disconnected" && state.kind !== "reconnect" && state.kind !== "unavailable";

  return (
    // The wrapper is the container: a container query reads an ancestor, never the element itself.
    <div className="@container/an">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 @min-[60rem]/an:grid-cols-[14rem_minmax(0,1fr)]">
        <ChannelSidebar items={CHANNELS.map((c) => ({ channel: c, conn: connected(conns, c.kind === "read" ? c.provider : null) }))} current={id} onSelect={setId} />

        <section aria-label={`${channel.label} analytics`} className="flex min-w-0 flex-col gap-4">
          <ChannelAnalyticsHeader
            icon={Icon}
            label={channel.label}
            identity={channel.kind === "manual" ? "Published by hand" : data?.account?.name ?? conn.name ?? " "}
            status={headerStatus(channel, conn.state, state)}
            freshness={data && channel.kind === "read" ? `Updated ${clockTime(data.readAt)} from ${channel.source}` : null}
            controls={showRange ? <DateRangeSelector value={days} onChange={setDays} /> : null}
            calendar={channel.calendar}
          />
          {/* The container for the panel's own layout (two insight columns once it has room). */}
          <div className="@container/panel min-w-0">
            {channel.kind === "manual" ? (
              <ManualPublishingState base={base} channel={channel} icon={Icon} />
            ) : (
              // key: another account or range starts a fresh panel (its chart choice included).
              <ReadPanel key={`${id}:${days}`} channel={channel} state={state} wide={wide} days={days} retry={retry} />
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

/** One read channel's panel for its state (exported for tests: it is pure given the state). */
export function ReadPanel({ channel, state, wide, days, retry }: { channel: ReadChannel; state: PanelState; wide: ChannelAnalyticsDto | null; days: number; retry: () => void }) {
  const Icon = CHANNEL_ICON[channel.id];
  const again = (
    <Button size="sm" variant="outline" onClick={retry}>
      <RefreshCw aria-hidden />
      Try again
    </Button>
  );
  switch (state.kind) {
    case "manual":
      return null;
    case "disconnected":
    case "reconnect":
      return <PlatformConnectionState channel={channel} icon={Icon} broken={state.kind === "reconnect"} />;
    case "loading":
      return <PanelSkeleton count={channel.tiles.length + 1} />;
    case "error":
      return (
        <AnalyticsEmptyState icon={CloudOff} title={`Couldn't read ${channel.label}'s numbers`} primary={again}>
          {state.message} This is usually a passing problem on the way to {channel.source}; the account itself is still connected.
        </AnalyticsEmptyState>
      );
    case "incomplete":
      return (
        <AnalyticsEmptyState icon={CloudOff} title={`${channel.source} didn't answer in time`} primary={again}>
          {channel.source} was slow or busy, so no numbers arrived this time. Nothing is wrong with the account: try again in a minute.
        </AnalyticsEmptyState>
      );
    case "unavailable":
      return (
        <AnalyticsEmptyState
          icon={Icon}
          title={`${channel.label} isn't sharing its analytics`}
          primary={
            <Button asChild size="sm">
              <Link href="/connections">Reconnect {channel.label}</Link>
            </Button>
          }
          secondary={again}
          aside={<StateList title={`Once ${channel.label} shares its numbers, this page shows`} items={channel.gains} />}
        >
          The account is connected, but {channel.source} refused every request for its numbers, so there is nothing to show (this is not a row of zeros). That usually means the connection is missing a permission {channel.source} needs for analytics; reconnecting on the Connections page asks for the permissions again.
        </AnalyticsEmptyState>
      );
    case "pending":
      return <Pending channel={channel} data={state.data} again={again} />;
    case "ok":
      return <Numbers channel={channel} a={state.data} wide={wide} days={days} pendingDays={state.pendingDays} />;
  }
}

/** Connected, but every day is still being counted by the platform: say so, with the account's own figures that are in. */
function Pending({ channel, data, again }: { channel: ReadChannel; data: ChannelAnalyticsDto; again: ReactNode }) {
  const acct = data.account;
  return (
    <AnalyticsEmptyState
      icon={CHANNEL_ICON[channel.id]}
      title={`${channel.source} is still counting these days`}
      primary={again}
      aside={
        acct && (acct.followers != null || acct.posts != null) ? (
          <div>
            <p className="text-sm font-medium">The account today</p>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              <AnalyticsMetricCard plain label="Followers" value={acct.followers} />
              {acct.posts != null ? <AnalyticsMetricCard plain label={channel.posts?.plural === "Pins" ? "Pins" : "Posts"} value={acct.posts} /> : null}
            </dl>
          </div>
        ) : undefined
      }
    >
      {channel.label} finishes each day&apos;s numbers some time after it ends, and none of these {data.days} days are ready yet. They fill in on their own; nothing is missing for good.
    </AnalyticsEmptyState>
  );
}

/** A channel's numbers: the figures (with the previous period where it can be said), the breakdown, notices, chart, insights. */
function Numbers({ channel, a, wide, days, pendingDays }: { channel: ReadChannel; a: ChannelAnalyticsDto; wide: ChannelAnalyticsDto | null; days: number; pendingDays: number }) {
  const t = a.totals;
  const account = a.account!;
  const tiles = channel.tiles.filter((m) => m.key in t);
  const more = channel.more.filter((m) => t[m.key] != null);
  const series = channel.series.flatMap((s) => {
    const d = seriesOf(a, s.key);
    return d ? [{ key: s.key, label: s.label, what: s.what, days: d }] : [];
  });
  const countries = a.countries && a.countries.length > 0 ? a.countries : null;
  const posts = a.posts && a.posts.length > 0 && channel.posts ? a.posts : null;
  const followersHint = account.posts != null ? `${account.posts.toLocaleString()} ${channel.posts?.plural === "Pins" ? "Pins" : "posts"} on the account` : "People following the account";

  return (
    <div className="flex flex-col gap-4">
      <AnalyticsMetricGrid count={tiles.length + 1} label={`${channel.label} figures`}>
        <AnalyticsMetricCard label="Followers" value={account.followers} hint={followersHint} />
        {tiles.map((m) => (
          <AnalyticsMetricCard key={m.key} label={m.label} value={t[m.key] ?? null} hint={m.hint} comparison={previousPeriod(a, wide, m.key)} days={days} />
        ))}
      </AnalyticsMetricGrid>

      {more.length > 0 && (
        <section aria-label="Breakdown" className="rounded-2xl border border-border bg-card px-4 py-3">
          <dl className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {more.map((m) => (
              <div key={m.key} className="flex items-baseline gap-1.5" title={m.hint || undefined}>
                <dd className="font-semibold tabular-nums">{fmt(t[m.key])}</dd>
                <dt className="text-muted-foreground">{m.label.toLowerCase()}</dt>
              </div>
            ))}
          </dl>
        </section>
      )}

      {channel.id === "facebook" && a.posts === null && (
        <AnalyticsDataNotice tone="warning" title="Numbers for each Page post are missing">
          Reading single Page posts needs Facebook&apos;s pages_read_user_content permission, which the app gets only after Meta&apos;s app review.
          {!a.partial && " The Page's own numbers above (followers, media views, engagements, Page views and new followers) are complete."}
        </AnalyticsDataNotice>
      )}
      {a.partial && <AnalyticsDataNotice title="Some numbers didn't arrive in time">They show as — for now and come in on the next read.</AnalyticsDataNotice>}

      {series.length === 0 && pendingDays > 0 && (
        <AnalyticsDataNotice title={`${channel.source} is still counting the last ${pendingDays === 1 ? "day" : `${pendingDays} days`}`}>Their numbers fill in later; nothing is missing for good.</AnalyticsDataNotice>
      )}
      {series.length > 0 && (
        <AnalyticsChartCard
          series={series}
          from={a.from}
          to={a.to}
          note={pendingDays > 0 ? `${channel.source} is still counting the last ${pendingDays === 1 ? "day" : `${pendingDays} days`}; ${pendingDays === 1 ? "its bar fills" : "their bars fill"} in later.` : undefined}
        />
      )}

      {(countries || posts) && (
        <div className={countries && posts ? "grid grid-cols-[minmax(0,1fr)] gap-4 @min-[56rem]/panel:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]" : "grid grid-cols-[minmax(0,1fr)] gap-4"}>
          {countries && <AudienceInsights countries={countries} followers={account.followers} />}
          {posts && channel.posts && <TopPerformingPosts posts={posts} spec={channel.posts} />}
        </div>
      )}
    </div>
  );
}

function PanelSkeleton({ count }: { count: number }) {
  return (
    <div aria-busy="true" aria-label="Loading numbers" className="flex flex-col gap-4">
      <AnalyticsMetricGridSkeleton count={count} />
      <div className="h-72 animate-pulse rounded-2xl bg-muted" />
    </div>
  );
}
