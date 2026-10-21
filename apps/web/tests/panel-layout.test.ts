import { describe, expect, it } from "vitest";
import { sanitize, type Layout } from "@/components/workspace/panel-layout";

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
