import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CalendarCard, MonthGrid } from "@/components/calendar/month-grid";

type Item = { id: string; title: string };
const grid = (byDay: Map<string, Item[]>, loaded = true) =>
  renderToStaticMarkup(
    createElement(MonthGrid<Item>, {
      month: { y: 2026, m: 10 },
      headId: "h",
      byDay,
      idOf: (i) => i.id,
      selectedId: "b",
      onOpen: () => {},
      card: (i, form, selected) => createElement(CalendarCard, { form, tone: "info" as const, selected, about: i.title, onClick: () => {}, title: i.title }),
      dayList: () => null,
      summary: (i) => ({ title: i.title, time: null, status: "To do" }),
      tone: () => "muted" as const,
      noun: ["task", "tasks"],
      emptyMonth: "Nothing due this month",
      gate: (children: ReactNode) => (loaded ? children : "loading"),
      footer: "legend",
      loaded,
    }),
  );

describe("MonthGrid", () => {
  it("puts each item on its day, names the day in the calendar's noun, and marks the open item", () => {
    const html = grid(new Map([["2026-11-30", [{ id: "a", title: "Fix menu" }, { id: "b", title: "Send quote" }]]]));
    expect(html).toContain('aria-label="Monday 30 November, 2 tasks: Fix menu (To do); Send quote (To do)"');
    expect(html).toMatch(/aria-current="true"[^>]*>.*Send quote/);
    expect(html).not.toContain("Nothing due this month");
    expect(html).toContain("legend");
    // November 2026 starts on a Sunday: the grid runs Monday 26 October to Sunday 6 December, six weeks.
    expect(html.match(/role="cell"/g)).toHaveLength(42);
  });

  it("says when the month is empty, and shows only the gate until it has loaded", () => {
    expect(grid(new Map())).toContain("Nothing due this month");
    const waiting = grid(new Map(), false);
    expect(waiting).toContain("loading");
    expect(waiting).not.toContain('role="table"');
  });
});
