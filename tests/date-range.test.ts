import { describe, expect, it } from "vitest";
import { change, presetRange, rangeDays, readRange, withRange, zoneToday } from "@/lib/data-api";

const today = "2026-11-23";
const params = (href: string) => new URL(href).searchParams;

describe("date range in the URL", () => {
  it("survives a reload: what withRange writes, readRange reads back, other parameters kept", () => {
    const href = withRange("https://app.test/performance?tab=search", { from: "2026-10-01", to: "2026-10-31" });
    expect(params(href).get("tab")).toBe("search");
    expect(readRange(params(href), today)).toEqual({ from: "2026-10-01", to: "2026-10-31" });
  });

  it("falls back to the last 28 days for a missing, reversed, malformed or over-90-day range", () => {
    const last28 = { from: "2026-10-27", to: today };
    for (const q of ["", "?from=2026-11-10&to=2026-11-01", "?from=2026-1-1&to=2026-11-01", "?from=2026-01-01&to=2026-11-01"]) {
      expect(readRange(params(`https://app.test/performance${q}`), today)).toEqual(last28);
    }
  });

  it("accepts exactly 90 days", () => {
    const r = presetRange(90, today);
    expect(rangeDays(r)).toBe(90);
    expect(readRange(params(withRange("https://app.test/", r)), today)).toEqual(r);
  });
});

describe("zoneToday", () => {
  it("is the brand's date, not UTC's", () => {
    const now = new Date("2026-11-23T23:30:00Z");
    expect(zoneToday("Europe/Paris", now)).toBe("2026-11-24");
    expect(zoneToday("UTC", now)).toBe("2026-11-23");
    expect(zoneToday("Not/AZone", now)).toBe("2026-11-23");
  });
});

describe("change", () => {
  it("is a signed percentage, or null with nothing before", () => {
    expect(change(112, 100)).toBe("+12%");
    expect(change(97, 100)).toBe("−3%");
    expect(change(5, 0)).toBeNull();
  });
});
