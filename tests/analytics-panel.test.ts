import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AnalyticsMetricCard } from "@/components/social/analytics/analytics-metric-card";
import { ReadPanel } from "@/components/social/analytics/analytics-view";
import { channelById, panelState, type ReadChannel } from "@/lib/analytics-channels";
import type { ChannelAnalyticsDto } from "@/shared";

const read = (over: Partial<ChannelAnalyticsDto> = {}): ChannelAnalyticsDto => ({
  channel: "facebook", state: "ok", account: { name: "Bois & Chiffons", followers: 900, posts: null }, days: 7, from: "2026-11-20", to: "2026-11-26",
  totals: { views: 300, engagements: 0, pageViews: null, newFollowers: 2 }, daily: [{ day: "2026-11-26", value: 3 }], dailyEngagements: null, followersDaily: [],
  countries: null, posts: null, partial: false, readAt: "2026-11-27T10:00:00.000Z", ...over,
});
const panel = (id: string, data: ChannelAnalyticsDto, wide: ChannelAnalyticsDto | null = null) => {
  const channel = channelById(id) as ReadChannel;
  return renderToStaticMarkup(createElement(ReadPanel, { channel, state: panelState(channel, "on", { kind: "ready", data }), wide, days: data.days, retry: () => {} }));
};

describe("AnalyticsMetricCard", () => {
  it("tells a real 0 from a number the platform didn't give", () => {
    const zero = renderToStaticMarkup(createElement(AnalyticsMetricCard, { label: "Saves", value: 0, hint: "Pins saved" }));
    expect(zero).toContain(">0<");
    expect(zero).not.toContain("Not available");
    const missing = renderToStaticMarkup(createElement(AnalyticsMetricCard, { label: "Saves", value: null, hint: "Pins saved" }));
    expect(missing).toContain("—");
    expect(missing).toContain("Not available");
  });
});

describe("ReadPanel", () => {
  it("Facebook: the permission notice says only per-post numbers are missing", () => {
    const html = panel("facebook", read());
    expect(html).toContain("Numbers for each Page post are missing");
    expect(html).toContain("pages_read_user_content");
    expect(html).toContain("are complete");
  });

  it("shows the previous period only for counts, from a read of twice the days", () => {
    const html = panel("facebook", read(), read({ days: 14, totals: { views: 550, engagements: 0, pageViews: null, newFollowers: 2 } }));
    expect(html).toContain("+20%");
    expect(html).toContain("vs previous 7 days");
    expect(html).toContain("None in the previous 7 days either");
  });

  it("Pinterest with every number refused offers a reconnect, never zeros", () => {
    const html = panel("pinterest", read({ channel: "pinterest", totals: { impressions: null, saves: null }, daily: [], dailyEngagements: [] }));
    expect(html).toContain("isn&#x27;t sharing its analytics");
    expect(html).toContain("Reconnect Pinterest");
    expect(html).not.toContain(">0<");
  });

  it("Pinterest still counting its days says so with the account's own figures", () => {
    const html = panel("pinterest", read({ channel: "pinterest", account: { name: "@shop", followers: 0, posts: 2 }, totals: { impressions: null }, daily: [{ day: "2026-11-26", value: null }] }));
    expect(html).toContain("still counting these days");
    expect(html).toContain("Pins");
  });

  it("Threads not connected: what connecting brings and Connect Threads", () => {
    const channel = channelById("threads") as ReadChannel;
    const html = renderToStaticMarkup(createElement(ReadPanel, { channel, state: { kind: "disconnected" }, wide: null, days: 28, retry: () => {} }));
    expect(html).toContain("Connect Threads");
    expect(html).toContain("Views per day");
  });
});
