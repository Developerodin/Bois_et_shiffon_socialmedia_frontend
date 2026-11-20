import { describe, expect, it } from "vitest";
import { applyOrder, move, parseOrder } from "@/lib/agent-order";

const items = ["spark", "beat", "wave", "drift"].map((id) => ({ id }));
const ids = (l: { id: string }[]) => l.map((x) => x.id);

describe("agent order", () => {
  it("keeps the default order without a saved one", () => {
    expect(ids(applyOrder(items, null))).toEqual(["spark", "beat", "wave", "drift"]);
  });
  it("applies the saved order, dropping unknown ids and keeping new agents at the end in default order", () => {
    expect(ids(applyOrder(items, ["drift", "gone", "wave"]))).toEqual(["drift", "wave", "spark", "beat"]);
  });
  it("moves an item and ignores out-of-range moves", () => {
    expect(move(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(move(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
    expect(move(["a", "b", "c"], 0, 3)).toEqual(["a", "b", "c"]);
  });
  it("reads only a list of strings", () => {
    expect(parseOrder('["wave","drift"]')).toEqual(["wave", "drift"]);
    expect(parseOrder('{"a":1}')).toBeNull();
    expect(parseOrder("[1]")).toBeNull();
    expect(parseOrder("not json")).toBeNull();
    expect(parseOrder(null)).toBeNull();
  });
});
