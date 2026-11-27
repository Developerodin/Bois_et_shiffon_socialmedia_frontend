"use client";

import { useCallback } from "react";
import { ExternalLink } from "lucide-react";
import { request } from "@/components/settings/api";
import { ListSkeleton, LoadError, useLoad } from "@/components/settings/shared";
import { Stat } from "@/components/data/shared";
import { DayBars, dayLabel } from "@/components/data/day-bars";
import type { AnalyticsChannel, ChannelAnalyticsDto, ChannelPostDto } from "@/shared";

export const DAYS = 28;
const NAME: Record<AnalyticsChannel, string> = { instagram: "Instagram", facebook: "Facebook Page", pinterest: "Pinterest", threads: "Threads" };
const n = (v: number | null | undefined) => (v == null ? "—" : v.toLocaleString());
const COUNTRY = (() => {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" });
  } catch {
    return null;
  }
})();
const countryName = (code: string) => {
  try {
    return COUNTRY?.of(code) ?? code;
  } catch {
    return code;
  }
};
const TYPE: Record<string, string> = { REELS: "Reel", STORY: "Story", CAROUSEL_ALBUM: "Carousel", VIDEO: "Video", IMAGE: "Photo" };
const postType = (p: ChannelPostDto) => (p.productType === "REELS" || p.productType === "STORY" ? TYPE[p.productType] : TYPE[p.mediaType ?? ""] ?? "Post");

/** One account's numbers. `compact` (the Channels page): the figures and the daily chart only; the calendar has the rest. */
export function AccountNumbers({ base, channel, titled, compact = false }: { base: string; channel: AnalyticsChannel; titled: boolean; compact?: boolean }) {
  const fetcher = useCallback(() => request<ChannelAnalyticsDto>(`${base}/insights/channel?channel=${channel}&days=${DAYS}`), [base, channel]);
  const { state, reload } = useLoad(fetcher);
  const name = NAME[channel];
  if (state.kind === "loading") return <ListSkeleton label={`Loading ${name} numbers`} rows={1} />;
  if (state.kind === "forbidden") return null;
  if (state.kind === "error") return <LoadError message={state.message} onRetry={reload} />;
  const a = state.data;
  if (a.state !== "ok" || !a.account) {
    return (
      <p className="text-sm text-muted-foreground">
        {a.state === "reconnect" ? `${name} needs reconnecting before its numbers can be read.` : `Connect ${name} to see its numbers here.`}
      </p>
    );
  }
  const t = a.totals;
  const ig = channel === "instagram";
  const range = `${dayLabel(a.from)} – ${dayLabel(a.to)}`;
  const top = ig && a.posts ? [...a.posts].sort((x, y) => (y.metrics?.reach ?? -1) - (x.metrics?.reach ?? -1)).slice(0, 5) : [];
  return (
    <section className="@container flex min-w-0 flex-col gap-4" aria-label={`${name} numbers`}>
      <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
        {titled && <span className="font-medium">{name}</span>}
        <span className="text-muted-foreground">{a.account.name}</span>
        <span className="text-xs text-muted-foreground">&middot; {range}</span>
      </div>
      {/* Sized by the space the panel has (a container query), not the window: it also sits in a half-width card. */}
      <div className="grid grid-cols-2 gap-4 @min-[28rem]:grid-cols-3 @min-[46rem]:grid-cols-5">
        <Stat label="Followers" value={n(a.account.followers)} />
        {ig ? (
          <>
            <Stat label="Accounts reached" value={n(t.reach)} />
            <Stat label="Views" value={n(t.views)} />
            <Stat label="Interactions" value={n(t.interactions)} />
          </>
        ) : (
          <>
            <Stat label="Media views" value={n(t.views)} />
            <Stat label="Post engagements" value={n(t.engagements)} />
            <Stat label="Page views" value={n(t.pageViews)} />
          </>
        )}
        <Stat label="New followers" value={n(t.newFollowers)} />
      </div>
      {ig && !compact && (
        <p className="text-xs text-muted-foreground">
          {n(t.accountsEngaged)} accounts engaged &middot; {n(t.likes)} likes &middot; {n(t.comments)} comments &middot; {n(t.shares)} shares &middot; {n(t.saves)} saves &middot; {n(t.linkTaps)} link taps
        </p>
      )}
      <DayBars days={a.daily} what={ig ? "accounts reached" : "media views"} title={ig ? "Accounts reached per day" : "Media views per day"} />
      {!compact && ig && a.countries && a.countries.length > 0 && (
        <div className="text-xs">
          <p className="mb-1 text-muted-foreground">Followers by country</p>
          <ol className="flex flex-wrap gap-x-4 gap-y-1">
            {a.countries.map((c) => (
              <li key={c.country}>
                {countryName(c.country)} <span className="tabular-nums text-muted-foreground">{n(c.followers)}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {!compact && top.length > 0 && (
        <div className="text-sm">
          <p className="mb-1 text-xs text-muted-foreground">Best of the latest {a.posts!.length} posts, by accounts reached (all time)</p>
          <ul className="divide-y divide-border">
            {top.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{p.postedAt ? dayLabel(p.postedAt.slice(0, 10)) : ""}</span>
                <span className="w-16 shrink-0 text-xs text-muted-foreground">{postType(p)}</span>
                <span className="min-w-0 flex-1 truncate">{p.caption ?? "No caption"}</span>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {n(p.metrics?.reach)} reached &middot; {n(p.metrics?.likes)} likes &middot; {n(p.metrics?.comments)} comments &middot; {n(p.metrics?.saves)} saves
                </span>
                {p.permalink && (
                  <a href={p.permalink} target="_blank" rel="noreferrer noopener" className="text-muted-foreground hover:text-foreground" aria-label="Open on Instagram">
                    <ExternalLink aria-hidden className="size-3.5" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {!ig && !compact && <p className="text-xs text-muted-foreground">Per-post numbers for the Page need a Facebook permission the app doesn&apos;t have yet.</p>}
      {a.partial && <p className="text-xs text-muted-foreground">Some numbers didn&apos;t arrive in time; they&apos;re shown as —. Open the calendar again later for the rest.</p>}
    </section>
  );
}
