import { describe, expect, it } from "vitest";
import { adsView, salesView } from "@/lib/performance-summary";
import { timeAgo } from "@/lib/time";
import type { AdsSummaryDto, AdsTotals, DataSourceDto, SalesCurrency, SalesSummaryDto } from "@/shared";

const now = Date.parse("2026-11-27T12:00:00Z");
const hoursAgo = (h: number) => new Date(now - h * 3600_000).toISOString();

const source = (p: Partial<DataSourceDto> = {}): DataSourceDto => ({
  id: "s",
  kind: "META_ADS",
  status: "ACTIVE",
  lastResult: { at: hoursAgo(3), okAt: hoursAgo(3), reason: null, count: 1, error: null },
  sync: null,
  syncedThrough: "2026-11-26",
  reportsInZone: null,
  ...p,
});
const totals = (p: Partial<AdsTotals>): AdsTotals => ({ currency: "EUR", spend: "120.00", purchases: 3, purchaseValue: "360.00", roas: 3, costPerPurchase: "40.00", ...p });
const ads = (t: AdsTotals[]): AdsSummaryDto => ({ totals: t, previous: [], previousRange: { from: "2026-10-03", to: "2026-10-30" } });
const zero = { orders: 0, gross: "0", discounts: "0", netSales: "0", total: "0", refunded: "0" };
const currency = (p: Partial<SalesCurrency> & { orders?: number }): SalesCurrency => ({
  currency: "EUR",
  totals: { ...zero, orders: p.orders ?? 4, netSales: "400.00" },
  previous: zero,
  days: [],
  netExVat: "333.33",
  exVatFrom: null,
  exVatMissing: 0,
  ...p,
});
const sales = (c: SalesCurrency[]): SalesSummaryDto => ({ currencies: c });

describe("adsView", () => {
  it("is 'none' with no account, or only switched-off ones", () => {
    expect(adsView([], null, now)).toEqual({ kind: "none" });
    expect(adsView([source({ status: "OFF" })], null, now)).toEqual({ kind: "none" });
  });

  it("waits, with no figures, until a first sync succeeds", () => {
    expect(adsView([source({ lastResult: null })], null, now)).toEqual({ kind: "waiting", text: "Not synced yet" });
    expect(adsView([source({ lastResult: null, sync: { state: "running", since: null, backfill: false } })], null, now)).toEqual({ kind: "waiting", text: "Syncing for the first time" });
    // A failed first run has no okAt either: still no figures.
    expect(adsView([source({ lastResult: { at: hoursAgo(1), okAt: null, reason: "failed", count: 0, error: "x" } })], null, now).kind).toBe("waiting");
  });

  it("is 'empty' after a sync with no spend, never a zero", () => {
    expect(adsView([source()], ads([]), now)).toEqual({ kind: "empty", status: `Updated ${timeAgo(hoursAgo(3), now)}` });
    expect(adsView([source()], ads([totals({ spend: "0.00", roas: null })]), now).kind).toBe("empty");
  });

  it("gives spend and ROAS per currency, null ROAS kept for '—'", () => {
    const v = adsView([source()], ads([totals({}), totals({ currency: "INR", spend: "5000.00", roas: null })]), now);
    expect(v).toEqual({
      kind: "numbers",
      status: `Updated ${timeAgo(hoursAgo(3), now)}`,
      items: [{ currency: "EUR", spend: "120.00", roas: 3 }, { currency: "INR", spend: "5000.00", roas: null }],
    });
  });

  it("says when the last run failed, the oldest success, and accounts not synced yet", () => {
    const failed = source({ id: "a", lastResult: { at: hoursAgo(1), okAt: hoursAgo(26), reason: "failed", count: 0, error: "x" } });
    const fresh = source({ id: "b" });
    const never = source({ id: "c", lastResult: null });
    const v = adsView([failed, fresh, never], ads([totals({})]), now);
    expect(v.kind === "numbers" && v.status).toBe(`Updated ${timeAgo(hoursAgo(26), now)} · Last sync failed · 1 account not synced yet`);
    expect(adsView([source({ status: "ERROR", lastResult: { at: hoursAgo(1), okAt: hoursAgo(5), reason: "reconnect", count: 0, error: "x" } })], ads([]), now)).toEqual({
      kind: "empty",
      status: `Updated ${timeAgo(hoursAgo(5), now)} · Needs reconnecting`,
    });
  });
});

describe("salesView", () => {
  const shop = source({ kind: "SHOPIFY_ORDERS" });

  it("is 'none' when orders aren't turned on", () => {
    expect(salesView(undefined, null, now)).toEqual({ kind: "none" });
  });

  it("leaves out a currency with orders only in the previous period", () => {
    expect(salesView(shop, sales([currency({ orders: 0 })]), now).kind).toBe("empty");
    expect(salesView(shop, sales([]), now).kind).toBe("empty");
  });

  it("gives net sales without VAT and orders, keeping a missing ex-VAT figure as null", () => {
    const v = salesView(shop, sales([currency({}), currency({ currency: "USD", orders: 2, netExVat: null, exVatMissing: 1 })]), now);
    expect(v.kind === "numbers" && v.items).toEqual([
      { currency: "EUR", netExVat: "333.33", exVatFrom: null, exVatMissing: 0, orders: 4 },
      { currency: "USD", netExVat: null, exVatFrom: null, exVatMissing: 1, orders: 2 },
    ]);
  });
});
