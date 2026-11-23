"use client";

import { useCallback } from "react";
import { Megaphone } from "lucide-react";
import { request } from "@/components/settings/api";
import { ListSkeleton, LoadError, useLoad } from "@/components/settings/shared";
import { EmptyState } from "@/components/ui/empty-state";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { PageSection } from "@/components/ui/page-section";
import { cn } from "@/lib/utils";
import { SourceNotice, brandApi, rangeQuery, useReloadOnFocus, type DataSourceDto } from "@/components/performance/posts-tab";

// ---- mirror of server DTO — replace with synced type at merge ------------------------------------------------------
// shared/api/ads.ts: GET ads/summary, GET ads/campaigns. Money is a decimal string with its ISO currency beside it;
// currencies are never summed, so totals come one per currency.

type AdsTotalsDto = {
  currency: string;
  spend: string;
  purchases: number;
  purchaseValue: string;
  /** purchase value ÷ spend as Meta reports it; null when spend is 0 */
  roas: number | null;
  /** null when there were no purchases */
  costPerPurchase: string | null;
};
/** Held (H1): only sent once budgets are set; the tab shows nothing without it. */
type AdsBudgetDto = {
  /** "YYYY-MM" */
  month: string;
  currency: string;
  budget: string;
  spent: string;
  /** days from the 1st to syncedThrough; 0 = no data yet */
  elapsedDays: number;
  daysInMonth: number;
};
type AdsSummaryDto = {
  totals: AdsTotalsDto[];
  /** The same-length range just before from..to */
  previous: AdsTotalsDto[];
  previousRange: { from: string; to: string };
  budget?: AdsBudgetDto[] | null;
};
type AdsCampaignDto = AdsTotalsDto & { accountId: string; campaignId: string; campaignName: string; impressions: number; clicks: number };
type AdsCampaignsDto = { campaigns: AdsCampaignDto[] };

// ---- formatting ---------------------------------------------------------------------------------------------------

const money = (v: string | null | undefined, currency: string) =>
  v == null ? "—" : new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(v));
const roas = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}×`);
const whole = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

/** "+12 %" against the previous period; null when there's nothing to compare with. */
function change(now: number | null, before: number | null): string | null {
  if (now == null || before == null || before === 0) return null;
  const pct = Math.round(((now - before) / Math.abs(before)) * 100);
  return `${pct > 0 ? "+" : ""}${pct} %`;
}
const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

function Stat({ label, value, before, now, prev }: { label: string; value: string; before: string; now: number | null; prev: number | null }) {
  const delta = change(now, prev);
  return (
    <div className="flex flex-col">
      <span className="font-display text-xl font-medium tabular-nums">{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs text-muted-foreground">
        Before: {before}
        {delta ? ` (${delta})` : null}
      </span>
    </div>
  );
}

function Totals({ now, prev }: { now: AdsTotalsDto; prev: AdsTotalsDto | undefined }) {
  const c = now.currency;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-muted/40 px-4 py-3 sm:grid-cols-3 lg:grid-cols-5">
      <Stat label="Spend" value={money(now.spend, c)} before={money(prev?.spend, c)} now={num(now.spend)} prev={num(prev?.spend)} />
      <Stat label="Purchases" value={whole(now.purchases)} before={whole(prev?.purchases)} now={now.purchases} prev={num(prev?.purchases)} />
      <Stat label="Purchase value" value={money(now.purchaseValue, c)} before={money(prev?.purchaseValue, c)} now={num(now.purchaseValue)} prev={num(prev?.purchaseValue)} />
      <Stat label="ROAS" value={roas(now.roas)} before={roas(prev?.roas)} now={now.roas} prev={prev?.roas ?? null} />
      <Stat label="Cost per purchase" value={money(now.costPerPurchase, c)} before={money(prev?.costPerPurchase, c)} now={num(now.costPerPurchase)} prev={num(prev?.costPerPurchase)} />
    </div>
  );
}

/** Spent against the month's budget, and whether that's ahead of the days gone. */
function Pacing({ budgets }: { budgets: AdsBudgetDto[] }) {
  return (
    <PageSection id="ads-pacing" title="Budget pacing" className="flex flex-col gap-4">
      {budgets.map((b) => {
        const budget = Number(b.budget);
        const spent = Number(b.spent);
        const used = budget > 0 ? Math.min(1, spent / budget) : 0;
        const expected = b.daysInMonth > 0 ? b.elapsedDays / b.daysInMonth : 0;
        const pace =
          b.elapsedDays === 0 ? "No data yet" : used > expected * 1.1 ? "Ahead of budget" : used < expected * 0.9 ? "Behind budget" : "On pace";
        return (
          <div key={`${b.month}:${b.currency}`} className="flex flex-col gap-1.5 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span>
                {money(b.spent, b.currency)} of {money(b.budget, b.currency)} · {b.month}
              </span>
              <span className="text-xs text-muted-foreground">
                {pace}
                {b.elapsedDays ? ` · day ${b.elapsedDays} of ${b.daysInMonth}` : null}
              </span>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
              <div className={cn("h-full rounded-full", used > expected * 1.1 ? "bg-warning" : "bg-primary")} style={{ width: `${used * 100}%` }} />
              {b.elapsedDays ? <div className="absolute inset-y-0 w-0.5 bg-foreground/60" style={{ left: `${expected * 100}%` }} /> : null}
            </div>
          </div>
        );
      })}
    </PageSection>
  );
}

// ---- the tab ------------------------------------------------------------------------------------------------------

/** Meta Ads spend and results for `from`..`to` ("YYYY-MM-DD"), per currency and per campaign. ads.read; the shell hides it otherwise. */
export function AdsTab({ workspaceId, brandId, from, to }: { workspaceId: string; brandId: string; from: string; to: string }) {
  const base = brandApi(workspaceId, brandId);
  const range = rangeQuery(from, to);
  const fetcher = useCallback(
    () =>
      Promise.all([
        request<{ sources: DataSourceDto[] }>(`${base}/data-sources`),
        request<AdsSummaryDto>(`${base}/ads/summary?${range}`),
        request<AdsCampaignsDto>(`${base}/ads/campaigns?${range}`),
      ]).then(([s, summary, c]) => ({
        sources: s.sources.filter((d) => d.kind === "META_ADS"),
        summary,
        campaigns: [...c.campaigns].sort((a, b) => Number(b.spend) - Number(a.spend)),
      })),
    [base, range],
  );
  const { state, reload } = useLoad(fetcher);
  useReloadOnFocus(reload);

  if (state.kind === "loading") return <ListSkeleton label="Loading ad results" />;
  if (state.kind === "forbidden") return <EmptyState icon={Megaphone} title="You can't see ad results" description="Ask a workspace owner for access." />;
  if (state.kind === "error") return <LoadError message={state.message} onRetry={reload} />;

  const { sources, summary, campaigns } = state.data;
  if (!sources.length) {
    return (
      <EmptyState
        icon={Megaphone}
        title="No ad account connected"
        description="Connect a Meta ad account in Connections to see spend, purchases and ROAS here."
      />
    );
  }

  const currencies = summary.totals.map((t) => t.currency).join(", ");
  const zones = [...new Set(sources.map((s) => s.reportsInZone).filter(Boolean))].join(", ");
  const empty = !summary.totals.length && !campaigns.length;

  return (
    <div className="flex flex-col gap-4">
      <PageSection
        id="ads"
        title="Meta Ads"
        description={currencies ? `In the ad account's currency: ${currencies}. Before = ${summary.previousRange.from} to ${summary.previousRange.to}.` : undefined}
        actions={empty ? undefined : <ExportCsvButton url={`${base}/ads/export?format=xlsx&${range}`} label="Export Excel" filename={`ads-${from}-${to}.xlsx`} />}
        className="flex flex-col gap-4"
      >
        {sources.map((s) => (
          <SourceNotice key={s.id} source={s} provider={sources.length > 1 && s.label ? `Meta ad account ${s.label}` : "Meta Ads"} />
        ))}
        {empty ? (
          <p className="text-sm text-muted-foreground">No ad spend in these dates.</p>
        ) : (
          <>
            {summary.totals.map((t) => (
              <Totals key={t.currency} now={t} prev={summary.previous.find((p) => p.currency === t.currency)} />
            ))}
            {campaigns.length ? (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-5 py-2 font-medium">Campaign</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Spend</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Purchases</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Purchase value</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">ROAS</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Cost per purchase</th>
                      <th scope="col" className="px-3 py-2 text-right font-medium">Clicks</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {campaigns.map((c) => (
                      <tr key={`${c.accountId}:${c.campaignId}`}>
                        <td className="max-w-72 truncate px-5 py-2.5 font-medium">{c.campaignName}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(c.spend, c.currency)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{whole(c.purchases)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(c.purchaseValue, c.currency)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{roas(c.roas)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{money(c.costPerPurchase, c.currency)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{whole(c.clicks)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        )}
        <p className="text-xs text-muted-foreground">
          Purchases, purchase value and ROAS are as Meta reports them, with Ads Manager&rsquo;s default attribution.
          {zones ? ` Days are in the ad account's time zone (${zones}).` : null}
        </p>
      </PageSection>
      {summary.budget?.length ? <Pacing budgets={summary.budget} /> : null}
    </div>
  );
}
