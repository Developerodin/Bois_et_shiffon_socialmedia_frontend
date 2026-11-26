import { describe, expect, it } from "vitest";
import { pacingLine } from "@/components/performance/ad-budgets";
import { ratioLine } from "@/components/performance/ads-tab";

describe("ad budgets", () => {
  it("pacing: on, under and over with the stale-rate note; no data, no rate, Google later", () => {
    const ok = { platform: "META", state: "ok", through: "2026-10-10", spent: "500.00", expected: "1000.00", ratio: 0.5, status: "under", currency: "EUR", staleRateFrom: null } as const;
    expect(pacingLine(ok)).toMatch(/^Under pace: .+ spent through .+ expected by then \(50 %\)\.$/);
    expect(pacingLine({ ...ok, status: "over", ratio: 1.5, staleRateFrom: "2026-09-20" })).toMatch(/^Over pace: .*\(150 %\)\. Uses an exchange rate from /);
    expect(pacingLine({ platform: "META", state: "no_data" })).toBe("No ad data for this month yet.");
    expect(pacingLine({ platform: "META", state: "no_rate" })).toContain("No exchange rate");
    expect(pacingLine({ platform: "GOOGLE", state: "google_later" })).toBe("Google Ads spend arrives in Phase 3.");
  });

  it("shop revenue ÷ ad spend says it is converted, and why there is none", () => {
    expect(ratioLine({ ratio: 3, currency: "EUR", why: null, staleRateFrom: null })).toContain("3.00× (net sales without VAT ÷ spend in EUR; Shopify days and ad account days may differ by a few hours)");
    expect(ratioLine({ ratio: null, currency: null, why: "currencies", staleRateFrom: null })).toContain("several currencies");
    expect(ratioLine({ ratio: 2, currency: "EUR", why: null, staleRateFrom: "2026-09-20" })).toContain("Uses an exchange rate from");
  });
});
