import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QuoteDto } from "@/shared";
import type { QuotePreview } from "@/components/crm/api";
import { QuoteSheet } from "@/components/crm/quotes/quote-sheet";
import { cancelQuestion, fromDraft, handActions, nextQuoteStep, QUOTE_STATUS_LABEL, subtotalNotice } from "@/components/crm/quotes/quotes-board";
import { QuotePreviewBody } from "@/components/crm/quotes/shopify-dialog";
import { versionChanges } from "@/components/crm/quotes/quote-versions";
import { agentEntries, navFor } from "@/lib/nav";

const quote: QuoteDto = {
  id: "q1", number: "Q-0042", status: "CREATED", version: 2, contactName: "Jeanne", contactEmail: "jeanne@client.test", currency: "EUR",
  lines: [{ productId: "p1", variantId: "gid://shopify/ProductVariant/7", title: "Linen sofa", quantity: 2, unitPrice: "1000.00" }, { productId: null, variantId: null, title: "Delivery", quantity: 1, unitPrice: "80.00" }],
  discount: { kind: "PERCENT", value: "10" }, totals: { subtotal: "2080.00", discount: "208.00", total: "1872.00" }, note: "Delivery in May", internalNote: "Margin ok",
  validUntil: "2026-12-24", shopifyName: "#D1", needsShopifyUpdate: false, shopifySubtotal: "1872.00", subtotalDiffers: false, subtotalAccepted: false,
  invoiceUrl: null, sentAt: null, declinedReason: null, createdById: "u1", createdAt: "2026-11-24T10:00:00Z", updatedAt: "2026-11-24T10:00:00Z",
};
const preview = (p: QuotePreview["preview"], over: Partial<QuotePreview> = {}): QuotePreview => ({ preview: p, attempt: 1, confirmToken: "t", expiresAt: "", writes: { ready: true }, last: null, ...over });
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe("Sales & CRM nav", () => {
  it("Spark's slot opens /crm only with the flag and a CRM key", () => {
    const spark = (f: Parameters<typeof agentEntries>[0], p?: string[]) => agentEntries(f, p).find((e) => e.id === "spark");
    expect(spark([], ["crm.manage"])).toMatchObject({ href: "/agents/spark", soon: true });
    expect(spark(["crm"], ["brand.read", "crm.read"])).toMatchObject({ href: "/agents/spark", soon: true });
    expect(spark(["crm"], ["crm.manage"])).toMatchObject({ href: "/crm", role: "Sales & CRM", soon: false });
    // Quotes only for now: inbox.read alone can't open /crm, so the slot stays as it was.
    expect(spark(["crm"], ["inbox.read"])).toMatchObject({ href: "/agents/spark", soon: true });
    expect(navFor("/crm").title).toBe("Sales & CRM");
  });
});

describe("the quote editor", () => {
  it("sends lines, never totals: a catalogue line keeps its frozen title and price", () => {
    const sent = fromDraft([
      { productId: "p1", title: "Linen sofa", quantity: "2", unitPrice: "1000.00" },
      { productId: null, title: "Delivery", quantity: "1", unitPrice: "80" },
    ]);
    expect(sent).toEqual([{ productId: "p1", title: "Linen sofa", quantity: 2, unitPrice: "1000.00" }, { title: "Delivery", quantity: 1, unitPrice: "80" }]);
    expect(JSON.stringify(sent)).not.toContain("total");
  });

  it("shows the server's totals", () => {
    const out = html(createElement(QuoteSheet, { quote }));
    for (const v of ["2080.00 EUR", "−208.00 EUR", "1872.00 EUR", "Shipping and tax are added by Shopify", "Valid until 2026-12-24"]) expect(out).toContain(v);
    expect(out).not.toContain("Margin ok");
    // Valid 30 days from the invoice send: before it, a draft.
    const unsent = html(createElement(QuoteSheet, { quote: { ...quote, validUntil: null } }));
    expect(unsent).toContain("Draft");
    expect(unsent).not.toContain("Valid until");
  });

  it("prints Shopify's subtotal when a person accepted it", () => {
    const out = html(createElement(QuoteSheet, { quote: { ...quote, shopifySubtotal: "1872.01", subtotalDiffers: true, subtotalAccepted: true } }));
    expect(out).toContain("subtotal (accepted)");
    expect(out).toContain("1872.01 EUR");
    expect(html(createElement(QuoteSheet, { quote }))).not.toContain("(accepted)");
  });

  it("warns that a sent quote's invoice stays payable when cancelled", () => {
    expect(cancelQuestion({ status: "SENT", shopifyName: "#D1", sentAt: "2026-11-20T10:00:00Z" })).toContain("invoice stays payable");
    expect(cancelQuestion({ status: "DRAFT", shopifyName: null, sentAt: null })).toBe("Delete this quote?");
  });

  it("offers the next Shopify step from the quote's state", () => {
    expect(nextQuoteStep({ ...quote, status: "DRAFT" })).toBe("create");
    expect(nextQuoteStep({ ...quote, status: "DRAFT", lines: [] })).toBeNull();
    expect(nextQuoteStep({ ...quote, needsShopifyUpdate: true })).toBe("update");
    expect(nextQuoteStep(quote)).toBe("invoice");
    expect(nextQuoteStep({ ...quote, status: "SENT" })).toBeNull();
  });

  it("a subtotal difference is named and holds the invoice until accepted", () => {
    const differs = { ...quote, shopifySubtotal: "1872.01", subtotalDiffers: true };
    expect(subtotalNotice(differs)).toBe("Shopify's subtotal is 1872.01 EUR; ours is 1872.00 EUR.");
    expect(nextQuoteStep(differs)).toBeNull();
    expect(nextQuoteStep({ ...differs, subtotalAccepted: true })).toBe("invoice");
    expect(subtotalNotice(quote)).toBeNull();
  });
});

describe("the quote confirm dialogs", () => {
  it("list every line, the discount, the note and the total", () => {
    const out = html(createElement(QuotePreviewBody, {
      action: "create",
      preview: preview({ draftOrder: null, currency: "EUR", lines: quote.lines.map(({ variantId, title, quantity, unitPrice }) => ({ variantId, title, quantity, unitPrice })), discount: quote.discount, note: "Delivery in May", tag: "sma-quote-q1", total: "1872.00" }),
    }));
    for (const v of ["Linen sofa", "1000.00 EUR", "Delivery", "free line", "10%", "Delivery in May", "1872.00 EUR before shipping and tax", "no email until you send the invoice"]) expect(out).toContain(v);
  });

  it("an invoice shows to, subject and message", () => {
    const out = html(createElement(QuotePreviewBody, { action: "invoice", preview: preview({ draftOrder: "#D1", to: "jeanne@client.test", subject: "Quote Q-0042 from B&C", message: "Delivery in May" }) }));
    for (const v of ["#D1", "jeanne@client.test", "Quote Q-0042 from B&amp;C", "Delivery in May"]) expect(out).toContain(v);
  });

  it("says when Shopify writes aren't connected yet", () => {
    const out = html(createElement(QuotePreviewBody, { action: "invoice", preview: preview({ draftOrder: "#D1", to: "a@b.test", subject: "s", message: "" }, { writes: { ready: false, reason: "NOT_CONNECTED" } }) }));
    expect(out).toContain("Shopify writes aren&#x27;t connected yet");
  });
});

describe("the print view", () => {
  it("prints the quote alone: marked as the print root, so the shell stays off the paper", () => {
    const page = readFileSync("app/(shell)/crm/quotes/[id]/print/page.tsx", "utf8");
    expect(page).toContain("data-print-root");
    expect(readFileSync("app/globals.css", "utf8")).toMatch(/:has\(\[data-print-root\]\) > :not\(\[data-print-root\]/);
  });
});

describe("quotes by hand and declined", () => {
  const hand = { ...quote, shopifyName: null };
  it("a quote outside Shopify is marked sent from DRAFT and accepted from SENT or EXPIRED; any made, sent or expired one can be declined", () => {
    expect(handActions({ ...hand, status: "DRAFT" })).toEqual(["markSent"]);
    expect(handActions({ ...hand, status: "DRAFT", lines: [] })).toEqual([]);
    expect(handActions({ ...hand, status: "SENT" })).toEqual(["markAccepted", "decline"]);
    expect(handActions({ ...hand, status: "EXPIRED" })).toEqual(["markAccepted", "decline"]);
    expect(handActions({ ...quote, status: "SENT" })).toEqual(["decline"]);
    expect(handActions({ ...quote, status: "ACCEPTED" })).toEqual([]);
  });
  it("declined has its label; a hand-sent quote's cancel says nothing about Shopify", () => {
    expect(QUOTE_STATUS_LABEL.DECLINED).toBe("Declined");
    expect(cancelQuestion({ ...hand, status: "SENT" })).toBe("Cancel this quote?");
    expect(cancelQuestion({ ...hand, status: "DRAFT", sentAt: "2026-11-20T10:00:00Z" })).toBe("Cancel this quote?");
  });
});

describe("earlier versions", () => {
  it("names each line added, removed or changed since that version", () => {
    const sofa = { productId: "p1", variantId: null, title: "Linen sofa", quantity: 1, unitPrice: "1000.00" };
    const before = [sofa, { productId: null, variantId: null, title: "Delivery", quantity: 1, unitPrice: "80.00" }];
    const now = [{ ...sofa, quantity: 2, unitPrice: "950.00" }, { productId: null, variantId: null, title: "Cushion", quantity: 2, unitPrice: "40.00" }];
    expect(versionChanges(before, now)).toEqual(["Linen sofa: quantity 1 → 2, price 1000.00 → 950.00", "Removed: Delivery", "Added: Cushion"]);
    expect(versionChanges(now, now)).toEqual([]);
  });
});
