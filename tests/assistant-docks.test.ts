import { describe, expect, it } from "vitest";
import { assistantDocks } from "@/lib/nav";

describe("assistantDocks", () => {
  it("docks on ordinary pages", () => {
    expect(assistantDocks("/")).toBe(true);
    expect(assistantDocks("/photoshoot")).toBe(true);
  });
  it("undocks on /reels and below it", () => {
    expect(assistantDocks("/reels")).toBe(false);
    expect(assistantDocks("/reels/abc")).toBe(false);
  });
  it("matches whole segments only", () => {
    expect(assistantDocks("/reelsx")).toBe(true);
  });
});
