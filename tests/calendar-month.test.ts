import { beforeAll, describe, expect, it } from "vitest";
import { dayKey, gridRange, gridStep, groupByDay, monthGrid, popoverLeft, shortTime } from "@/lib/calendar-month";

// A zone with DST, so a day that is 23 or 25 hours long is in play.
beforeAll(() => {
  process.env.TZ = "Europe/Paris";
});

const keys = (g: Date[]) => g.map(dayKey);

describe("monthGrid", () => {
  it("starts on the Monday on or before the 1st and ends on the Sunday on or after the last day", () => {
    // 1 Nov 2026 is a Sunday: six leading October days, and the month needs 6 weeks.
    const g = monthGrid(2026, 10);
    expect(g).toHaveLength(42);
    expect(dayKey(g[0])).toBe("2026-10-26");
    expect(g[0].getDay()).toBe(1);
    expect(dayKey(g[6])).toBe("2026-11-01");
    expect(dayKey(g[41])).toBe("2026-12-06");
    expect(g[41].getDay()).toBe(0);
  });

  it("has no leading or trailing days for a month that fills 4 weeks", () => {
    // 1 Feb 2027 is a Monday.
    const g = monthGrid(2027, 1);
    expect(g).toHaveLength(28);
    expect(dayKey(g[0])).toBe("2027-02-01");
    expect(dayKey(g[27])).toBe("2027-02-28");
  });

  it("has 5 weeks for a month that needs them", () => {
    // 1 Dec 2026 is a Tuesday: one leading day, 31 days, 5 weeks.
    const g = monthGrid(2026, 11);
    expect(g).toHaveLength(35);
    expect(dayKey(g[0])).toBe("2026-11-30");
    expect(dayKey(g[34])).toBe("2027-01-03");
  });

  it("gives every day once, at midnight, across a DST change", () => {
    // Paris moves its clocks on 29 March 2026.
    const g = monthGrid(2026, 2);
    expect(new Set(keys(g)).size).toBe(g.length);
    for (const d of g) expect(d.getHours()).toBe(0);
    for (let n = 1; n < g.length; n++) expect((g[n].getDay() + 6) % 7).toBe(n % 7);
  });
});

describe("gridRange", () => {
  it("runs from the first day's local midnight to the midnight after the last day", () => {
    expect(gridRange(monthGrid(2026, 10))).toEqual({ from: "2026-10-25T23:00:00.000Z", to: "2026-12-06T23:00:00.000Z" });
  });
});

describe("groupByDay", () => {
  it("groups by the viewer's local day, undated posts under unscheduled, keeping order", () => {
    const items = [
      { id: "u", scheduledFor: null },
      { id: "a", scheduledFor: "2026-11-20T10:00:00Z" },
      // 23:30 UTC is already the 21st in Paris.
      { id: "b", scheduledFor: "2026-11-20T23:30:00Z" },
      { id: "c", scheduledFor: "2026-11-20T12:00:00Z" },
    ];
    const g = groupByDay(items);
    expect([...g.keys()]).toEqual(["unscheduled", "2026-11-20", "2026-11-21"]);
    expect(g.get("2026-11-20")!.map((i) => i.id)).toEqual(["a", "c"]);
  });
});

describe("day grid keys", () => {
  it("moves a day left or right and a week up or down, and stops at the edges", () => {
    expect(gridStep(10, "ArrowRight", 42)).toBe(11);
    expect(gridStep(10, "ArrowLeft", 42)).toBe(9);
    expect(gridStep(10, "ArrowDown", 42)).toBe(17);
    expect(gridStep(10, "ArrowUp", 42)).toBe(3);
    expect(gridStep(0, "ArrowLeft", 42)).toBeNull();
    expect(gridStep(3, "ArrowUp", 42)).toBeNull();
    expect(gridStep(40, "ArrowDown", 42)).toBeNull();
    expect(gridStep(10, "Enter", 42)).toBeNull();
  });
});

describe("day popover", () => {
  it("sits under its cell, moved left to stay inside, never past the left edge", () => {
    expect(popoverLeft(100, 288, 800)).toBe(100);
    expect(popoverLeft(700, 288, 800)).toBe(512);
    expect(popoverLeft(100, 288, 200)).toBe(0);
  });

  it("a cell shows a compact 24-hour time, none at midnight", () => {
    expect(shortTime(new Date(2026, 10, 23, 14, 30).toISOString())).toMatch(/^14.30$/);
    expect(shortTime(new Date(2026, 10, 23, 0, 0).toISOString())).toBeNull();
  });
});
