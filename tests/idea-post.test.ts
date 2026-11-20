import { describe, expect, it } from "vitest";
import { pickPostByIdea } from "@/components/workspace/content-panels";

describe("planned idea → its post", () => {
  it("maps each idea to the first post planned from it and skips posts without one", () => {
    const m = pickPostByIdea({ items: [{ id: "p1", opportunityId: "o1" }, { id: "p2", opportunityId: "o1" }, { id: "p3", opportunityId: null }, { id: "p4" }] as never });
    expect([...m]).toEqual([["o1", "p1"]]);
    expect(pickPostByIdea({}).size).toBe(0);
  });
});
