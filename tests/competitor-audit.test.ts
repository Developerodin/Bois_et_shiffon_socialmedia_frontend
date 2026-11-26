import { describe, expect, it } from "vitest";
import { blockedAuditNote, readApproach } from "@/lib/competitor-audit";
import { dayDate } from "@/lib/time";

describe("blockedAuditNote", () => {
  it("says the credits were refunded and when to try again", () => {
    const until = "2026-12-03T10:00:00.000Z";
    expect(blockedAuditNote("tikamoon.com", until)).toBe(
      `tikamoon.com blocks automated readers, so it can't be audited right now. Your credits were refunded. You can try again after ${dayDate(until)}.`,
    );
  });

  it("leaves out the date when there is none", () => {
    expect(blockedAuditNote("tikamoon.com", null)).toBe("tikamoon.com blocks automated readers, so it can't be audited right now. Your credits were refunded.");
  });
});

describe("readApproach", () => {
  it("fills a partial audit's missing fields with empty values", () => {
    const empty = { positioning: "", audience: "", products: [], priceSignals: "", contentThemes: [], strengths: [], weaknesses: [] };
    expect(readApproach(null)).toEqual(empty);
    // A partial audit with no cited search keeps only its marker in the approach JSON.
    expect(readApproach({ partial: true, blockedReason: "x" } as never)).toEqual(empty);
  });

  it("keeps the fields search found", () => {
    expect(readApproach({ positioning: "Solid wood furniture.", products: ["Tables"] })).toMatchObject({ positioning: "Solid wood furniture.", products: ["Tables"], strengths: [] });
  });
});
