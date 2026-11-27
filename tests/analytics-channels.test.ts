import { describe, expect, it } from "vitest";
import { ADDITIVE, changeLabel, channelById, CHANNELS, comparable, panelState, pendingTail, postColumns, postSorts, previousPeriod, seriesOf, topPosts, type Channel, type Load, type ReadChannel } from "@/lib/analytics-channels";
import type { ChannelAnalyticsDto, ChannelPostDto } from "@/shared";

const read = (over: Partial<ChannelAnalyticsDto> = {}): ChannelAnalyticsDto => ({
  channel: "instagram",
  state: "ok",
  account: { name: "@shop", followers: 100, posts: 10 },
  days: 7,
  from: "2026-11-20",
  to: "2026-11-26",
  totals: { reach: 50, views: 120, interactions: 10, newFollowers: 4 },
  daily: [{ day: "2026-11-26", value: 5 }],
  dailyEngagements: null,
  followersDaily: [],
  countries: null,
  posts: null,
  partial: false,
  readAt: "2026-11-27T10:00:00.000Z",
  ...over,
});
const ready = (data: ChannelAnalyticsDto): Load => ({ kind: "ready", data });
const ch = (id: string) => channelById(id) as Channel;

describe("previousPeriod", () => {
  const cur = read();
  const wide = read({ days: 14, from: "2026-11-13", totals: { reach: 80, views: 220, interactions: 10, newFollowers: 4 } });

  it("takes the shorter period's total from the longer one's for counts of events", () => {
    expect(previousPeriod(cur, wide, "views")).toEqual({ previous: 100, change: 0.2 });
  });

  it("says no change can be computed against a previous 0 (change null), and a real 0 → 0 when both are 0", () => {
    expect(previousPeriod(cur, wide, "interactions")).toEqual({ previous: 0, change: null });
  });

  it("never compares unique counts, followers or rolling figures", () => {
    for (const key of ["reach", "accountsEngaged", "followers", "monthlyViews"]) expect(ADDITIVE.has(key)).toBe(false);
    expect(previousPeriod(cur, wide, "reach")).toBeNull();
  });

  it("only for 7 and 14 days, with a read of exactly twice the days", () => {
    expect(comparable(7)).toBe(true);
    expect(comparable(14)).toBe(true);
    expect(comparable(28)).toBe(false);
    expect(previousPeriod(read({ days: 28 }), read({ days: 56, totals: { views: 500 } }), "views")).toBeNull();
    expect(previousPeriod(cur, { ...wide, days: 28 }, "views")).toBeNull();
  });

  it("refuses when the reads end on different days, are partial, are missing a number, or would go negative", () => {
    expect(previousPeriod(cur, { ...wide, to: "2026-11-25" }, "views")).toBeNull();
    expect(previousPeriod({ ...cur, partial: true }, wide, "views")).toBeNull();
    expect(previousPeriod(cur, { ...wide, partial: true }, "views")).toBeNull();
    expect(previousPeriod(cur, { ...wide, totals: { views: null } }, "views")).toBeNull();
    expect(previousPeriod({ ...cur, totals: { views: null } }, wide, "views")).toBeNull();
    expect(previousPeriod(cur, { ...wide, totals: { views: 90 } }, "views")).toBeNull();
    expect(previousPeriod(cur, null, "views")).toBeNull();
    expect(previousPeriod(cur, { ...wide, channel: "facebook" }, "views")).toBeNull();
  });
});

describe("changeLabel", () => {
  it("rounds to whole percents, one decimal under 10 %, with a real minus sign", () => {
    expect(changeLabel(0.2)).toBe("+20%");
    expect(changeLabel(-0.0567)).toBe("−5.7%");
    expect(changeLabel(1.234)).toBe("+123%");
    expect(changeLabel(0.0001)).toBe("0%");
  });
});

describe("panelState", () => {
  it("LinkedIn and X are manual whatever the connections say", () => {
    expect(panelState(ch("linkedin"), "unknown", { kind: "loading" })).toEqual({ kind: "manual" });
    expect(panelState(ch("x"), "on", { kind: "loading" })).toEqual({ kind: "manual" });
  });

  it("a known missing or broken connection wins over the read", () => {
    expect(panelState(ch("threads"), "off", { kind: "loading" })).toEqual({ kind: "disconnected" });
    expect(panelState(ch("pinterest"), "broken", ready(read())).kind).toBe("reconnect");
  });

  it("the read's own state when the connections can't be seen", () => {
    expect(panelState(ch("threads"), "unknown", ready(read({ state: "not_connected", account: null }))).kind).toBe("disconnected");
    expect(panelState(ch("threads"), "unknown", ready(read({ state: "reconnect", account: null }))).kind).toBe("reconnect");
    expect(panelState(ch("instagram"), "unknown", { kind: "error", message: "x" })).toEqual({ kind: "error", message: "x" });
  });

  it("Pinterest A: tiny real numbers and zeros are numbers", () => {
    const a = read({ channel: "pinterest", totals: { impressions: 5, saves: 0, engagements: 0, outboundClicks: 0, pinClicks: 0 }, daily: [{ day: "2026-11-25", value: 5 }, { day: "2026-11-26", value: null }] });
    expect(panelState(ch("pinterest"), "on", ready(a))).toEqual({ kind: "ok", data: a, pendingDays: 1 });
    const zeros = read({ channel: "pinterest", totals: { impressions: 0 }, daily: [{ day: "2026-11-26", value: 0 }] });
    expect(panelState(ch("pinterest"), "on", ready(zeros)).kind).toBe("ok");
  });

  it("Pinterest B: days listed but none counted yet is pending", () => {
    const a = read({ channel: "pinterest", totals: { impressions: null, saves: null }, daily: [{ day: "2026-11-25", value: null }, { day: "2026-11-26", value: null }], dailyEngagements: [{ day: "2026-11-26", value: null }] });
    expect(panelState(ch("pinterest"), "on", ready(a)).kind).toBe("pending");
  });

  it("Pinterest C: every number refused and no days is unavailable, not zeros", () => {
    const a = read({ channel: "pinterest", totals: { impressions: null, saves: null, pinClicks: null, outboundClicks: null, engagements: null }, daily: [], dailyEngagements: [], posts: null });
    expect(panelState(ch("pinterest"), "on", ready(a)).kind).toBe("unavailable");
  });

  it("nothing at all because reads timed out is a temporary failure, not a permission", () => {
    const a = read({ totals: { views: null }, daily: [], partial: true });
    expect(panelState(ch("instagram"), "on", ready(a)).kind).toBe("incomplete");
  });
});

describe("pendingTail and seriesOf", () => {
  it("counts only the trailing days without a number", () => {
    expect(pendingTail([{ day: "a", value: null }, { day: "b", value: 1 }, { day: "c", value: null }, { day: "d", value: null }])).toBe(2);
    expect(pendingTail([])).toBe(0);
  });

  it("gives no series without a single number", () => {
    expect(seriesOf(read({ followersDaily: [{ day: "a", value: null }] }), "followersDaily")).toBeNull();
    expect(seriesOf(read(), "dailyEngagements")).toBeNull();
    expect(seriesOf(read(), "daily")).toHaveLength(1);
  });
});

describe("top posts", () => {
  const post = (id: string, m: Partial<Record<"reach" | "views" | "saves" | "likes", number | null>>): ChannelPostDto => ({
    id, mediaType: null, productType: null, postedAt: null, caption: null, permalink: null,
    metrics: { views: null, reach: null, likes: null, comments: null, shares: null, saves: null, interactions: null, navigation: null, ...m },
  });
  const posts = [post("a", { reach: 5, saves: 1 }), post("b", { reach: null, saves: 9 }), post("c", { reach: 20, saves: null }), post("d", { reach: 5 })];

  it("sorts highest first, posts without the number last in their given order", () => {
    expect(topPosts(posts, "reach").map((p) => p.id)).toEqual(["c", "a", "d", "b"]);
    expect(topPosts(posts, "saves", 2).map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("offers only the sorts and columns some post has a number for, the sorted one always shown", () => {
    const spec = (channelById("instagram") as ReadChannel).posts!;
    expect(postSorts(posts, spec).map((c) => c.key)).toEqual(["reach", "saves"]);
    expect(postColumns(posts, spec, spec.sorts[0]).map((c) => c.key)).toEqual(["reach", "saves"]);
    const withViews = [...posts, post("e", { views: 3 })];
    const views = spec.sorts.find((c) => c.key === "views")!;
    expect(postColumns(withViews, spec, views).map((c) => c.key)).toEqual(["views", "reach", "saves"]);
  });
});

describe("CHANNELS", () => {
  it("lists the six channels in the rail's order, two of them by hand", () => {
    expect(CHANNELS.map((c) => c.id)).toEqual(["instagram", "facebook", "pinterest", "threads", "linkedin", "x"]);
    expect(CHANNELS.filter((c) => c.kind === "manual").map((c) => c.id)).toEqual(["linkedin", "x"]);
  });
});
