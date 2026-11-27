import { describe, expect, it } from "vitest";
import type { Connection } from "@/components/settings/api";
import { CHANNEL_ICON, channelLabel } from "@/lib/post-labels";
import { attentionPosts, channelName, connectionLines, connectionState, landingCounts, providersOf, rowSummary, SOCIAL_ROWS, type ChannelSummary } from "@/lib/social-channels";

const next = (id: string, scheduledFor: string) => ({ id, title: id, scheduledFor, status: "SCHEDULED" });
const summary: ChannelSummary[] = [
  { channel: "INSTAGRAM_POST", awaiting: 2, next: next("ig", "2026-12-03T10:00:00Z") },
  { channel: "INSTAGRAM_STORY", awaiting: 1, next: null },
  { channel: "FACEBOOK_POST", awaiting: 1, next: next("fb", "2026-12-01T10:00:00Z") },
  { channel: "PINTEREST_PIN", awaiting: 4, next: next("pin", "2026-11-30T10:00:00Z") },
  { channel: "LINKEDIN_POST", awaiting: 0, next: null },
];
const conn = (provider: Connection["provider"], status: Connection["status"]): Connection => ({ id: `${provider}-${status}`, provider, displayName: "x", status, lastError: null, tokenExpiresAt: null, connectedAt: "2026-11-01T00:00:00Z" });
const names = new Map([["META", "Facebook Pages"], ["INSTAGRAM", "Instagram"]]);

describe("SOCIAL_ROWS", () => {
  it("every row's calendar filter has a label and an icon", () => {
    for (const r of SOCIAL_ROWS) {
      expect(channelLabel(r.filter)).not.toBe(r.filter);
      expect(CHANNEL_ICON[r.filter]).toBeDefined();
    }
  });
  it("lists Meta, Instagram, Pinterest, LinkedIn, X and Threads; LinkedIn and X have no connection", () => {
    expect(SOCIAL_ROWS.map((r) => r.label)).toEqual(["Meta", "Instagram", "Pinterest", "LinkedIn", "X", "Threads"]);
    expect(SOCIAL_ROWS.filter((r) => !providersOf(r.filter).length).map((r) => r.key)).toEqual(["linkedin", "x"]);
  });
});

describe("rowSummary", () => {
  it("Meta sums Facebook and Instagram and takes the earliest next post of either", () => {
    expect(rowSummary(summary, "meta")).toEqual({ awaiting: 4, next: next("fb", "2026-12-01T10:00:00Z") });
  });
  it("Instagram leaves Facebook out", () => {
    expect(rowSummary(summary, "instagram")).toEqual({ awaiting: 3, next: next("ig", "2026-12-03T10:00:00Z") });
  });
  it("one channel is its own line; none planned is null", () => {
    expect(rowSummary(summary, "PINTEREST_PIN")).toEqual({ awaiting: 4, next: next("pin", "2026-11-30T10:00:00Z") });
    expect(rowSummary(summary, "LINKEDIN_POST")).toEqual({ awaiting: 0, next: null });
    expect(rowSummary(summary, "X_POST")).toEqual({ awaiting: 0, next: null });
  });
});

describe("connectionLines", () => {
  it("is by hand without providers", () => {
    expect(connectionLines([], [conn("META", "ACTIVE")], names)).toBe("byHand");
  });
  it("says not connected, connected, or needs reconnect (worst wins), named from the providers list", () => {
    expect(connectionLines(["META", "INSTAGRAM"], [conn("META", "ACTIVE"), conn("META", "ERROR")], names)).toEqual([
      { provider: "META", name: "Facebook Pages", tone: "bad", label: "Needs reconnect" },
      { provider: "INSTAGRAM", name: "Instagram", tone: "muted", label: "Not connected" },
    ]);
    expect(connectionLines(["INSTAGRAM"], [conn("INSTAGRAM", "ACTIVE")], names)).toEqual([{ provider: "INSTAGRAM", name: "Instagram", tone: "good", label: "Connected" }]);
    expect(connectionLines(["PINTEREST"], [conn("PINTEREST", "REVOKED")], names)[0]).toMatchObject({ name: "PINTEREST", label: "Needs reconnect" });
  });
});

describe("providersOf", () => {
  it("Meta is the Facebook Pages and Instagram logins; Instagram and each of its formats only the Instagram one", () => {
    expect(providersOf("meta")).toEqual(["META", "INSTAGRAM"]);
    expect(providersOf("instagram")).toEqual(["INSTAGRAM"]);
    expect(providersOf("INSTAGRAM_REEL")).toEqual(["INSTAGRAM"]);
    expect(providersOf("FACEBOOK_POST")).toEqual(["META"]);
  });
  it("LinkedIn, X and an unknown value have none", () => {
    expect(providersOf("LINKEDIN_POST")).toEqual([]);
    expect(providersOf("X_POST")).toEqual([]);
    expect(providersOf("nope")).toEqual([]);
  });
});

describe("channelName", () => {
  it("names a row by its row label, any other channel by its label", () => {
    expect(channelName("meta")).toBe("Meta");
    expect(channelName("instagram")).toBe("Instagram");
    expect(channelName("INSTAGRAM_REEL")).toBe("Instagram Reel");
  });
});

describe("connectionState", () => {
  const state = (filter: string, list: Connection[]) => connectionState(providersOf(filter), list, names);
  it("is Manual publishing without a connection to publish through, whatever is connected", () => {
    expect(state("X_POST", [conn("META", "ACTIVE")])).toMatchObject({ kind: "manual", label: "Manual publishing", lines: [] });
  });
  it("Meta: both working is Connected, one Partially connected, neither Not connected", () => {
    expect(state("meta", [conn("META", "ACTIVE"), conn("INSTAGRAM", "ACTIVE")])).toMatchObject({ kind: "connected", tone: "good" });
    expect(state("meta", [conn("META", "ACTIVE")])).toMatchObject({ kind: "partial", label: "Partially connected", tone: "warn" });
    expect(state("meta", [])).toMatchObject({ kind: "none", label: "Not connected" });
  });
  it("the Instagram row reads the same Instagram connection as Meta", () => {
    const list = [conn("META", "ACTIVE")];
    expect(state("instagram", list).kind).toBe("none");
    expect(state("meta", list).lines.find((l) => l.provider === "INSTAGRAM")?.label).toBe("Not connected");
    expect(state("instagram", [conn("INSTAGRAM", "ACTIVE")]).kind).toBe("connected");
  });
  it("an account on record that isn't working is Needs reconnect; with another working, Partially connected", () => {
    expect(state("PINTEREST_PIN", [conn("PINTEREST", "ERROR")])).toMatchObject({ kind: "reconnect", tone: "bad" });
    expect(state("meta", [conn("META", "ERROR"), conn("INSTAGRAM", "ACTIVE")]).kind).toBe("partial");
  });
});

describe("landingCounts", () => {
  it("counts working channel accounts only, scheduled posts as the Scheduled filter does, and awaiting over every channel once", () => {
    const list = [conn("META", "ACTIVE"), conn("INSTAGRAM", "ERROR"), conn("PINTEREST", "ACTIVE"), { ...conn("GOOGLE", "ACTIVE") }];
    const items = [{ status: "SCHEDULED" }, { status: "SCHEDULED" }, { status: "APPROVED" }, { status: "PUBLISHED" }];
    expect(landingCounts(summary, items, list)).toEqual({ accounts: 2, scheduled: 2, awaiting: 8 });
  });
  it("leaves the accounts out when connections aren't known", () => {
    expect(landingCounts([], [], null)).toEqual({ accounts: null, scheduled: 0, awaiting: 0 });
  });
});

describe("attentionPosts", () => {
  const now = new Date("2026-11-27T12:00:00Z");
  const post = (id: string, status: string, scheduledFor: string | null) => ({ id, status, scheduledFor });
  const items = [
    post("a-undated", "AWAITING_APPROVAL", null),
    post("a-later", "AWAITING_APPROVAL", "2026-12-05T10:00:00Z"),
    post("a-soon", "AWAITING_APPROVAL", "2026-11-28T10:00:00Z"),
    post("s-later", "SCHEDULED", "2026-12-02T10:00:00Z"),
    post("d-soon", "DRAFT_REVIEW", "2026-11-29T10:00:00Z"),
    post("past", "SCHEDULED", "2026-11-20T10:00:00Z"),
    post("blocked", "BLOCKED", "2026-11-28T10:00:00Z"),
    post("undated", "PLANNED", null),
    post("done", "PUBLISHED", "2026-11-30T10:00:00Z"),
  ];
  it("lists awaiting approval soonest first (undated last), then the next dated open posts not blocked or awaiting", () => {
    const r = attentionPosts(items, now);
    expect(r.awaiting.map((p) => p.id)).toEqual(["a-soon", "a-later", "a-undated"]);
    expect(r.upcoming.map((p) => p.id)).toEqual(["d-soon", "s-later"]);
  });
  it("keeps at most n of each", () => {
    expect(attentionPosts(items, now, 1)).toEqual({ awaiting: [items[2]], upcoming: [items[4]] });
  });
});
