import { describe, expect, it } from "vitest";
import { nextSlot, takenKey } from "@/server/content/calendar";

describe("nextSlot with a campaign window (until)", () => {
  const from = new Date("2026-11-29T14:00:00Z"); // a Sunday: no channel's cadence day
  const until = new Date("2026-11-29T20:00:00Z");

  it("gives a Sunday 14:00–20:00 window a 14:00 slot on any channel", () => {
    for (const channel of ["INSTAGRAM_POST", "PINTEREST_PIN", "THREADS_POST"] as const) {
      expect(nextSlot(channel, from, new Set(), 30, until)?.toISOString()).toBe("2026-11-29T14:00:00.000Z");
    }
  });

  it("gives no slot at or after until", () => {
    expect(nextSlot("INSTAGRAM_POST", from, new Set(), 30, from)).toBeNull();
    expect(nextSlot("INSTAGRAM_POST", new Date("2026-11-28T08:00:00Z"), new Set(), 30, new Date("2026-11-28T09:00:00Z"))).toBeNull();
  });

  it("gives none when that channel's day is taken", () => {
    const taken = new Set([takenKey("INSTAGRAM_POST", from)]);
    expect(nextSlot("INSTAGRAM_POST", from, taken, 30, until)).toBeNull();
    expect(nextSlot("FACEBOOK_POST", from, taken, 30, until)).not.toBeNull();
  });

  it("uses 09:00 on later days, and the cadence without until", () => {
    const taken = new Set([takenKey("INSTAGRAM_POST", from)]);
    expect(nextSlot("INSTAGRAM_POST", from, taken, 30, new Date("2026-12-01T00:00:00Z"))?.toISOString()).toBe("2026-11-30T09:00:00.000Z");
    expect(nextSlot("INSTAGRAM_POST", from, new Set())?.toISOString()).toBe("2026-12-01T09:00:00.000Z"); // Tuesday
  });
});
