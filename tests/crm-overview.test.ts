import { describe, expect, it } from "vitest";
import { followUpLine } from "@/components/crm/follow-up-counts";

/** Plan 2026-11-27-crm, Task A10: the Overview's follow-up line. */
describe("followUpLine", () => {
  it("names only what is open, and nothing when nothing is", () => {
    expect(followUpLine({ needsReply: 2, overdue: 1, waiting: 3, mine: 0 })).toBe("2 need a reply · 1 overdue · 3 waiting on the customer");
    expect(followUpLine({ needsReply: 1, overdue: 0, waiting: 0, mine: 1 })).toBe("1 needs a reply");
    expect(followUpLine({ needsReply: 0, overdue: 0, waiting: 0, mine: 0 })).toBeNull();
  });
});
