import { describe, expect, it } from "vitest";
import type { DealDto, PipelineDto } from "@/shared";
import { crmAccess } from "@/components/crm/crm-link";
import { crmTabs } from "@/components/crm/crm-tabs";
import { closesDeal, dealHints, dealValueProblem, HAND_CLOSE_REASONS, totalsLine } from "@/components/crm/pipeline/labels";
import { commonCurrency, orderedColumns } from "@/components/crm/pipeline/pipeline-tab";
import { openDeals } from "@/components/crm/pipeline/quote-deal";

const deal = (over: Partial<DealDto> = {}): DealDto => ({
  id: "d1", title: "Sofa covers for the lobby", stage: "NEW", customer: null, company: null, conversationId: null, value: "1250.00", currency: "EUR",
  ownerId: null, nextAction: null, nextActionDue: null, closedReason: null, closedNote: null, stageChangedAt: "2026-11-20T10:00:00Z", closedAt: null,
  lostSuggested: false, lostButPaid: false, quotes: [], createdAt: "2026-11-20T10:00:00Z", updatedAt: "2026-11-20T10:00:00Z", ...over,
});

describe("the pipeline board", () => {
  it("is a crm.manage tab", () => {
    expect(crmTabs(crmAccess(["crm.manage"], []))).toContain("pipeline");
    expect(crmTabs(crmAccess(["inbox.read"], []))).not.toContain("pipeline");
  });

  it("totals each currency on its own, never added together", () => {
    expect(totalsLine([{ currency: "EUR", value: "1250.00" }, { currency: "USD", value: "300.00" }])).toBe("1250.00 EUR · 300.00 USD");
    expect(totalsLine([])).toBeNull();
  });

  it("shows every stage in order, a missing one empty", () => {
    const p: PipelineDto = { columns: [{ stage: "WON", deals: [], totals: [], more: false }, { stage: "NEW", deals: [deal()], totals: [], more: false }] };
    expect(orderedColumns(p).map((c) => [c.stage, c.deals.length])).toEqual([["NEW", 1], ["CONTACTED", 0], ["PROPOSAL", 0], ["NEGOTIATION", 0], ["WON", 0], ["LOST", 0]]);
  });

  it("starts a new deal in the currency most deals use", () => {
    const p: PipelineDto = { columns: [{ stage: "NEW", deals: [deal(), deal({ id: "d2", currency: "USD" }), deal({ id: "d3", currency: "USD" })], totals: [], more: false }] };
    expect(commonCurrency(p)).toBe("USD");
    expect(commonCurrency(null)).toBe("EUR");
  });

  it("links a quote to open deals only", () => {
    const cols = [{ stage: "PROPOSAL", deals: [deal({ stage: "PROPOSAL" })] }, { stage: "WON", deals: [deal({ id: "d9", stage: "WON" })] }];
    expect(openDeals(cols).map((d) => d.id)).toEqual(["d1"]);
  });
});

describe("closing a deal", () => {
  it("asks why for Won and Lost only, never offering the quote's own reason", () => {
    expect(closesDeal("WON")).toBe(true);
    expect(closesDeal("LOST")).toBe(true);
    expect(closesDeal("NEGOTIATION")).toBe(false);
    expect(HAND_CLOSE_REASONS).not.toContain("quote_accepted");
    expect(HAND_CLOSE_REASONS).toContain("price");
  });

  it("points at what to look at", () => {
    expect(dealHints(deal({ lostSuggested: true }))).toEqual(["Its quotes ended without a yes. Mark it lost?"]);
    expect(dealHints(deal({ lostButPaid: true }))).toEqual(["Marked lost, but one of its quotes was paid."]);
    expect(dealHints(deal())).toEqual([]);
  });

  it("needs a currency with a value", () => {
    expect(dealValueProblem("", "")).toBeNull();
    expect(dealValueProblem("1250.50", "eur")).toBeNull();
    expect(dealValueProblem("1250.505", "EUR")).toContain("1250.50");
    expect(dealValueProblem("1250", "")).toContain("currency");
  });
});
