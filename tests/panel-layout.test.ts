import { describe, expect, it } from "vitest";
import { layoutMessage, sanitize, type Layout } from "@/components/workspace/panel-layout";

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
