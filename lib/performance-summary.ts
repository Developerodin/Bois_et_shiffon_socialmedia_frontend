import { timeAgo } from "@/lib/time";
import type { AdsSummaryDto, DataSourceDto, DataSyncReason, SalesCurrency, SalesSummaryDto } from "@/shared";

/**
 * The Overview's performance figures, decided without rendering. Each source is in one of four states, and only the
 * last two draw numbers, so nothing reads as a zero that isn't one:
 * - none: no source of that kind (or only switched-off ones): "not connected / not turned on";
 * - waiting: no successful sync yet: the sync's own words, no figures;
 * - empty: synced, but nothing in the range;
 * - numbers: one entry per currency that had something in the range (never added across currencies).
 * `status` says how fresh the figures are, or why the last run didn't finish.
 */
export type SourceState<T> =
  | { kind: "none" }
  | { kind: "waiting"; text: string }
  | { kind: "empty"; status: string }
  | { kind: "numbers"; status: string; items: T[] };

export type AdsFigure = { currency: string; spend: string; roas: number | null };
export type SalesFigure = Pick<SalesCurrency, "currency" | "netExVat" | "exVatFrom" | "exVatMissing"> & { orders: number };

/** A failed or partial last run, in a few words (the full text stays on the tab, from DATA_SYNC_ERRORS). */
const REASON: Record<DataSyncReason, string> = {
  reconnect: "Needs reconnecting",
  permission: "Needs reconnecting",
  failed: "Last sync failed",
  partial: "Some days still loading",
  rate_limited: "Some days still loading",
};

const live = (sources: DataSourceDto[]) => sources.filter((s) => s.status !== "OFF");

/** The waiting line for sources that never synced: running or queued says so, else "Not synced yet". */
function waitingText(sources: DataSourceDto[]): string {
  if (sources.some((s) => s.sync?.state === "running")) return "Syncing for the first time";
  if (sources.some((s) => s.sync)) return "First sync queued";
  return "Not synced yet";
}

/**
 * How fresh the synced sources are: the oldest success ("Updated 3 h ago"); a run's problem (`lastResult.reason`, the
 * worst wins) or accounts not synced yet are added after it.
 */
function statusLine(synced: DataSourceDto[], notSynced: number, now: number): string {
  const oldest = synced.map((s) => s.lastResult!.okAt!).sort()[0];
  const parts = [`Updated ${timeAgo(oldest, now)}`];
  const reasons = synced.flatMap((s) => (s.lastResult?.reason ? [s.lastResult.reason] : []));
  const worst = (["reconnect", "permission", "failed", "partial", "rate_limited"] as const).find((r) => reasons.includes(r));
  if (worst) parts.push(REASON[worst]);
  if (notSynced) parts.push(`${notSynced} ${notSynced === 1 ? "account" : "accounts"} not synced yet`);
  return parts.join(" · ");
}

function stateOf<T>(sources: DataSourceDto[], items: T[] | null, now: number): SourceState<T> {
  const on = live(sources);
  if (!on.length) return { kind: "none" };
  const synced = on.filter((s) => s.lastResult?.okAt);
  if (!synced.length || !items) return { kind: "waiting", text: waitingText(on) };
  const status = statusLine(synced, on.length - synced.length, now);
  return items.length ? { kind: "numbers", status, items } : { kind: "empty", status };
}

/** Meta Ads: spend and ROAS per currency; a currency with no spend in the range is left out. */
export function adsView(sources: DataSourceDto[], summary: AdsSummaryDto | null, now = Date.now()): SourceState<AdsFigure> {
  const items = summary?.totals.filter((t) => Number(t.spend) > 0).map((t) => ({ currency: t.currency, spend: t.spend, roas: t.roas })) ?? null;
  return stateOf(sources, items, now);
}

/**
 * Shopify sales: net sales without VAT and orders per currency. A currency the summary lists only because the previous
 * period had orders (no orders in the range) is left out, so "no orders" never draws as 0.
 */
export function salesView(source: DataSourceDto | undefined, summary: SalesSummaryDto | null, now = Date.now()): SourceState<SalesFigure> {
  const items =
    summary?.currencies
      .filter((c) => c.totals.orders > 0)
      .map((c) => ({ currency: c.currency, netExVat: c.netExVat, exVatFrom: c.exVatFrom, exVatMissing: c.exVatMissing, orders: c.totals.orders })) ?? null;
  return stateOf(source ? [source] : [], items, now);
}
