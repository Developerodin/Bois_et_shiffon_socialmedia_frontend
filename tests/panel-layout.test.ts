import { describe, expect, it } from "vitest";
import { layoutMessage, revealPlan, sanitize, withPanel, type Layout } from "@/components/workspace/panel-layout";

type Id = "a" | "b" | "c";
const ids: Id[] = ["a", "b", "c"];
const fallback: Layout<Id> = { columns: [{ id: "x", size: 1, panels: ["a"] }], collapsed: [] };

describe("saved layout", () => {
  it("falls back on garbage or empty layouts", () => {
    expect(sanitize(null, ids, fallback)).toBe(fallback);
    expect(sanitize({ columns: "nope" }, ids, fallback)).toBe(fallback);
    expect(sanitize({ columns: [{ id: "1", size: 1, panels: [] }] }, ids, fallback)).toBe(fallback);
  });

  it("drops unknown and duplicate panels, empty columns and bad sizes", () => {
    const l = sanitize(
      { columns: [{ id: "1", size: -3, panels: ["a", "zzz", "a"] }, { id: "2", size: 2, panels: ["zzz"] }, { id: "3", size: 2, panels: ["b", "a"] }], collapsed: ["b", "zzz"] },
      ids,
      fallback,
    );
    expect(l.columns.map((c) => c.panels)).toEqual([["a"], ["b"]]);
    expect(l.columns[0].size).toBe(1);
    expect(l.collapsed).toEqual(["b"]);
  });

  it("loads a layout saved before panel heights existed", () => {
    const l = sanitize({ columns: [{ id: "1", size: 1, panels: ["a", "b"] }], collapsed: [] }, ids, fallback);
    expect(l.columns[0].panels).toEqual(["a", "b"]);
    expect(l.heights).toEqual({});
  });

  it("keeps good panel heights and drops bad or unknown ones", () => {
    const l = sanitize({ columns: [{ id: "1", size: 1, panels: ["a", "b", "c"] }], collapsed: [], heights: { a: 1.5, b: -1, c: "2", zzz: 3 } }, ids, fallback);
    expect(l.heights).toEqual({ a: 1.5 });
    expect(sanitize({ columns: [{ id: "1", size: 1, panels: ["a"] }], collapsed: [], heights: "nope" }, ids, fallback).heights).toEqual({});
    expect(sanitize({ columns: [{ id: "1", size: 1, panels: ["a"] }], collapsed: [], heights: { a: Infinity } }, ids, fallback).heights).toEqual({});
    expect(sanitize({ columns: [{ id: "1", size: 1, panels: ["a", "b"] }], collapsed: [], heights: { a: 0.01, b: 0.05 } }, ids, fallback).heights).toEqual({ b: 0.05 });
  });
});

describe("layout announcement", () => {
  const cols = (...panels: Id[][]): Layout<Id> => ({ columns: panels.map((p, i) => ({ id: String(i), size: 1, panels: p })), collapsed: [] });

  it("names the column the panel is now in, out of how many", () => {
    expect(layoutMessage("Context", cols(["a"], ["b", "c"]), "c")).toBe("Context moved to column 2 of 2");
    // a moved right out of a one-panel column: that column is gone
    expect(layoutMessage("Context", cols(["b", "c", "a"]), "a")).toBe("Context moved to column 1 of 1");
    expect(layoutMessage("Context", cols(["a"], ["b"], ["c"]), "c")).toBe("Context moved to column 3 of 3");
  });

  it("says hidden when no column holds the panel", () => {
    expect(layoutMessage("Context", cols(["a"], ["b"]), "c")).toBe("Context hidden");
  });
});

describe("revealing a panel", () => {
  const l: Layout<Id> = { columns: [{ id: "1", size: 1, panels: ["a"] }, { id: "2", size: 1, panels: ["b"] }], collapsed: ["b"] };

  it("scrolls to a shown panel, offers to expand a collapsed one and to add an absent one", () => {
    expect(revealPlan(l, "a")).toBe("scroll");
    expect(revealPlan(l, "b")).toBe("expand");
    expect(revealPlan(l, "c")).toBe("add");
  });

  it("a shown panel needs no layout change: planning leaves the layout object untouched", () => {
    const before = JSON.stringify(l);
    revealPlan(l, "a");
    expect(JSON.stringify(l)).toBe(before);
  });

  it("Expand and Add to board produce the layout that is committed", () => {
    expect(withPanel(l, "b")).toEqual({ ...l, collapsed: [] });
    const added = withPanel(l, "c");
    expect(added.columns[1].panels).toEqual(["c", "b"]);
    expect(added.collapsed).toEqual(["b"]);
  });
});
