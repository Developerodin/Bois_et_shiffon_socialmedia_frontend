import { beforeAll, describe, expect, it } from "vitest";
import { CELL_FLOOR, CELL_FRAME, STACKED_STEP, cardsThatFit, cellFit, dayCards, dayCellLabel, newPostTime, dayKey, gridRange, gridStep, groupByDay, monthGrid, peekInset, popoverLeft, popoverSide, shortTime } from "@/lib/calendar-month";

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

describe("week rows", () => {
  it("gives Feb 2027 four weeks, Dec 2026 five and Nov 2026 six", () => {
    expect(monthGrid(2027, 1).length / 7).toBe(4);
    expect(monthGrid(2026, 11).length / 7).toBe(5);
    expect(monthGrid(2026, 10).length / 7).toBe(6);
  });
});

describe("cards in a day cell", () => {
  it("fits one more card per 22 px past the cell's 28 px frame, and at least one line", () => {
    expect(cardsThatFit(40)).toBe(1);
    expect(CELL_FLOOR).toBe(72);
    expect(cardsThatFit(CELL_FLOOR)).toBe(2);
    expect(cardsThatFit(93)).toBe(2);
    expect(cardsThatFit(94)).toBe(3);
    expect(cardsThatFit(127)).toBe(4);
    expect(cardsThatFit(200)).toBe(7);
  });

  it("never hides a post: shown plus more is the day's count", () => {
    for (const h of [CELL_FLOOR, 103, 130, 200])
      for (let n = 0; n < 12; n++) {
        const fit = cellFit(n, cardsThatFit(h));
        expect(fit.shown + fit.more).toBe(n);
        expect(fit.shown + (fit.more ? 1 : 0)).toBeLessThanOrEqual(cardsThatFit(h));
      }
  });

  it("uses two-line cards on a wide cell when every post fits that way, else one-line cards and +N more", () => {
    // A 133 x 100 cell (1657 x 921, six weeks): two two-line cards fit, three don't.
    expect(dayCards(1, 100, 133)).toEqual({ stacked: true, shown: 1, more: 0 });
    expect(dayCards(2, 100, 133)).toEqual({ stacked: true, shown: 2, more: 0 });
    expect(dayCards(3, 100, 133)).toEqual({ stacked: false, shown: 3, more: 0 });
    expect(dayCards(5, 100, 133)).toEqual({ stacked: false, shown: 2, more: 3 });
    // Too narrow for two lines: one-line cards even for one post.
    expect(dayCards(1, 100, 90)).toEqual({ stacked: false, shown: 1, more: 0 });
    expect(dayCards(0, CELL_FLOOR, 133)).toEqual({ stacked: true, shown: 0, more: 0 });
  });

  it("never lets two-line cards run out of the cell, and never hides a post", () => {
    for (const h of [CELL_FLOOR, 100, 130, 200])
      for (let n = 0; n < 12; n++) {
        const fit = dayCards(n, h, 140);
        expect(fit.shown + fit.more).toBe(n);
        if (fit.stacked) expect(CELL_FRAME + n * STACKED_STEP).toBeLessThanOrEqual(h);
      }
  });
});

describe("calendar beside the post peek", () => {
  it("moves in by what the peek covers of the main area, or not at all if the rest would be too narrow", () => {
    // 1920 wide: main 232..1536 (the docked assistant is right of it), a 560 px peek from 1360.
    expect(peekInset(232, 1536, 1360)).toBe(176);
    // The peek starts right of the main area: nothing covered.
    expect(peekInset(232, 1536, 1600)).toBe(0);
    // A phone: the peek covers everything, so the calendar stays put under it.
    expect(peekInset(0, 390, 0)).toBe(0);
    expect(peekInset(0, 820, 400, 360)).toBe(420);
    expect(peekInset(0, 820, 300, 360)).toBe(0);
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

  it("opens below when it fits or there is more room below, else above, capped to the room on its side", () => {
    expect(popoverSide(400, 100, 320)).toEqual({ side: "below", maxHeight: 320 });
    expect(popoverSide(200, 100, 320)).toEqual({ side: "below", maxHeight: 192 });
    expect(popoverSide(100, 500, 320)).toEqual({ side: "above", maxHeight: 320 });
    expect(popoverSide(100, 200, 320)).toEqual({ side: "above", maxHeight: 192 });
    expect(popoverSide(40, 60, 320)).toEqual({ side: "above", maxHeight: 120 });
  });

  it("a cell shows a compact 24-hour time, none at midnight", () => {
    expect(shortTime(new Date(2026, 10, 23, 14, 30).toISOString())).toMatch(/^14.30$/);
    expect(shortTime(new Date(2026, 10, 23, 0, 0).toISOString())).toBeNull();
  });
});

describe("compact cells", () => {
  it("shows every post up to the line limit, else one fewer and the rest as +N more", () => {
    expect(cellFit(0, 3)).toEqual({ shown: 0, more: 0 });
    expect(cellFit(3, 3)).toEqual({ shown: 3, more: 0 });
    expect(cellFit(4, 3)).toEqual({ shown: 2, more: 2 });
    expect(cellFit(9, 3)).toEqual({ shown: 2, more: 7 });
  });

  it("names a cell by its day, count and each post's time, full title and status", () => {
    expect(dayCellLabel("Monday 23 November", [])).toBe("Monday 23 November, 0 posts");
    expect(dayCellLabel("Monday 23 November", [{ title: "A festive dining table", time: "14:30", status: "Scheduled" }, { title: "Undated", time: null, status: "To write" }])).toBe(
      "Monday 23 November, 2 posts: 14:30 A festive dining table (Scheduled); Undated (To write)",
    );
  });
});

describe("New post from a day", () => {
  it("starts a later day at 10:00, today at the next whole hour, and a day that is over undated", () => {
    const now = new Date(2026, 10, 26, 14, 20); // 26 Nov 2026, 14:20 local (made here, after the zone is set)
    expect(newPostTime("2026-11-30", now)).toBe("2026-11-30T10:00");
    expect(newPostTime("2026-11-26", now)).toBe("2026-11-26T15:00");
    expect(newPostTime("2026-11-26", new Date(2026, 10, 26, 8, 0))).toBe("2026-11-26T10:00");
    expect(newPostTime("2026-11-25", now)).toBeNull();
    // Past 23:00 there is no whole hour left today.
    expect(newPostTime("2026-11-26", new Date(2026, 10, 26, 23, 5))).toBeNull();
  });
});
