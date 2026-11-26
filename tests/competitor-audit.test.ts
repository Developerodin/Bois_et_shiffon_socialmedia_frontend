import { describe, expect, it } from "vitest";
import { lastFailureNote, readApproach } from "@/lib/competitor-audit";
import { dayDate } from "@/lib/time";

describe("lastFailureNote", () => {
  const blocked = "tikamoon.com blocks automated readers, so it can't be audited. Your credits were refunded.";
  const c = { domain: "tikamoon.com", auditError: blocked, auditBlocked: false, auditBlockedUntil: null, auditBlockedAt: null };

  it("says nothing without a failure", () => {
    expect(lastFailureNote({ ...c, auditError: null })).toBeNull();
  });

  it("while blocked: says the credits were refunded and when to try again", () => {
    const until = "2026-12-03T10:00:00.000Z";
    expect(lastFailureNote({ ...c, auditBlocked: true, auditBlockedUntil: until, auditBlockedAt: "2026-11-26T10:00:00.000Z" })).toEqual({
      text: `tikamoon.com blocks automated readers, so it can't be audited right now. Your credits were refunded. You can try again after ${dayDate(until)}.`,
      soft: true,
    });
    expect(lastFailureNote({ ...c, auditBlocked: true })?.text).toBe("tikamoon.com blocks automated readers, so it can't be audited right now. Your credits were refunded.");
  });

  it("after the block lifted: a soft note that invites another try, not the red error", () => {
    const at = "2026-11-18T10:00:00.000Z";
    expect(lastFailureNote({ ...c, auditBlockedAt: at })).toEqual({ text: `Last tried ${dayDate(at)}: the site blocked automated readers. You can try again.`, soft: true });
  });

  it("any other failure: the error in red", () => {
    expect(lastFailureNote({ ...c, auditError: "Could not read tikamoon.com" })).toEqual({ text: "Last audit failed: Could not read tikamoon.com", soft: false });
  });
});

describe("readApproach", () => {
  it("fills a partial audit's missing fields with empty values", () => {
    const empty = { positioning: "", audience: "", products: [], priceSignals: "", contentThemes: [], strengths: [], weaknesses: [] };
    expect(readApproach(null)).toEqual(empty);
    // A partial audit with no cited search keeps only its marker in the approach JSON.
    expect(readApproach({ partial: true } as never)).toEqual(empty);
  });

  it("keeps the fields search found", () => {
    expect(readApproach({ positioning: "Solid wood furniture.", products: ["Tables"] })).toMatchObject({ positioning: "Solid wood furniture.", products: ["Tables"], strengths: [] });
  });
});
