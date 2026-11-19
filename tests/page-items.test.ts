import { describe, expect, it } from "vitest";
import { pageItems } from "@/lib/page-items";

describe("pageItems", () => {
  it("lists every page up to 7", () => {
    expect(pageItems(1, 1)).toEqual([1]);
    expect(pageItems(4, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
  it("keeps the ends and the current page's neighbours, with gaps between", () => {
    expect(pageItems(1, 28)).toEqual([1, 2, "gap", 28]);
    expect(pageItems(14, 28)).toEqual([1, "gap", 13, 14, 15, "gap", 28]);
    expect(pageItems(28, 28)).toEqual([1, "gap", 27, 28]);
  });
  it("shows a lone hidden page rather than a gap for it", () => {
    expect(pageItems(4, 28)).toEqual([1, 2, 3, 4, 5, "gap", 28]);
    expect(pageItems(25, 28)).toEqual([1, "gap", 24, 25, 26, 27, 28]);
  });
});
