import { describe, expect, it } from "vitest";
import type { Connection } from "@/components/settings/api";
import { CHANNEL_ICON, channelLabel } from "@/lib/post-labels";
import { connectionLines, rowSummary, SOCIAL_ROWS, type ChannelSummary } from "@/lib/social-channels";

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
    expect(SOCIAL_ROWS.filter((r) => !r.providers.length).map((r) => r.key)).toEqual(["linkedin", "x"]);
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
