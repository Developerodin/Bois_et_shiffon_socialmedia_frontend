"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Megaphone } from "lucide-react";
import { connectionsUrl, errorMessage, request, type Connection } from "@/components/settings/api";
import { ListSkeleton, LoadError, selectClass, useLoad } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ExportCsvButton } from "@/components/ui/export-csv-button";
import { PageSection } from "@/components/ui/page-section";
import { cn } from "@/lib/utils";
import { money, Stat } from "@/components/data/shared";
import { SyncedAt, useReloadWhenSynced } from "@/components/data/synced-at";
import { AdBudgets } from "@/components/performance/ad-budgets";
import { brandApi, change, rangeQuery, useReloadOnFocus, type DateRange } from "@/lib/data-api";
import { DATA_SOURCE_SLUGS, type AdsCampaignsDto, type AdsSummaryDto, type AdsTotals, type ChooseMetaAdAccountBody, type DataSourceDto, type MetaAdAccountsDto, type ShopRevenueOverSpend } from "@/shared";

// ---- formatting ---------------------------------------------------------------------------------------------------

const roas = (v: number | null | undefined) => (v == null ? "—" : `${v.toFixed(2)}×`);
const whole = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString());

const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

function Totals({ now, prev }: { now: AdsTotals; prev: AdsTotals | undefined }) {
  const c = now.currency;
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl bg-muted/40 px-4 py-3 sm:grid-cols-3 lg:grid-cols-5">
      <Stat label="Spend" value={money(now.spend, c)} before={money(prev?.spend, c)} delta={change(num(now.spend), num(prev?.spend))} />
      <Stat label="Purchases" value={whole(now.purchases)} before={whole(prev?.purchases)} delta={change(now.purchases, num(prev?.purchases))} />
      <Stat label="Purchase value" value={money(now.purchaseValue, c)} before={money(prev?.purchaseValue, c)} delta={change(num(now.purchaseValue), num(prev?.purchaseValue))} />
      <Stat label="ROAS" value={roas(now.roas)} before={roas(prev?.roas)} delta={change(now.roas, prev?.roas ?? null)} />
      <Stat label="Cost per purchase" value={money(now.costPerPurchase, c)} before={money(prev?.costPerPurchase, c)} delta={change(num(now.costPerPurchase), num(prev?.costPerPurchase))} />
    </div>
  );
}

/** Shop revenue ÷ ad spend, only sent to people who may see sales; says why there is no figure, and an old rate. */
export function ratioLine(r: ShopRevenueOverSpend): string {
  if (r.ratio === null) {
    const why = r.why === "no_spend" ? "no ad spend in these dates"
      : r.why === "currencies" ? "the shop sells in several currencies"
      : r.why === "no_rate" ? "no exchange rate yet"
      : "net sales without VAT don't cover these dates yet";
    return `Shop revenue ÷ ad spend: — (${why}).`;
  }
  const stale = r.staleRateFrom ? ` Uses an exchange rate from ${dayLabel(r.staleRateFrom)}.` : "";
  return `Shop revenue ÷ ad spend: ${r.ratio.toFixed(2)}× (net sales without VAT ÷ spend in ${r.currency}; Shopify days and ad account days may differ by a few hours).${stale}`;
}

// ---- the tab ------------------------------------------------------------------------------------------------------

/**
 * Meta Ads spend and results for the range ("YYYY-MM-DD"), per currency and per campaign. ads.read; the shell hides it
 * otherwise. `sources`: the META_ADS sources from PerformanceTabs' data-sources load. `canManage` (integrations.manage):
 * with no ad account chosen yet, pick one of the connected Meta ad accounts; `onSourceChanged` reloads the sources.
 */
const DAY = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const dayLabel = (d: string) => DAY.format(new Date(`${d}T00:00:00Z`));

export function AdsTab({ workspaceId, brandId, range: days, sources, canManage, canSetBudgets, onSourceChanged }: { workspaceId: string; brandId: string; range: DateRange; sources: DataSourceDto[]; canManage: boolean; canSetBudgets: boolean; onSourceChanged: () => void }) {
  const base = brandApi(workspaceId, brandId);
  const { from, to } = days;
  const range = rangeQuery(from, to);
  const fetcher = useCallback(
    () =>
      Promise.all([request<AdsSummaryDto>(`${base}/ads/summary?${range}`), request<AdsCampaignsDto>(`${base}/ads/campaigns?${range}`)]).then(([summary, c]) => ({
        summary,
        campaigns: [...c.campaigns].sort((a, b) => Number(b.spend) - Number(a.spend)),
      })),
    [base, range],
  );
  const { state, reload } = useLoad(fetcher);
  useReloadWhenSynced(sources, reload);
  useReloadOnFocus(reload, state);

  if (state.kind === "loading") return <ListSkeleton label="Loading ad results" />;
  if (state.kind === "forbidden") return <EmptyState icon={Megaphone} title="You can't see ad results" description="Ask a workspace owner for access." />;
  if (state.kind === "error") return <LoadError message={state.message} onRetry={reload} />;

  const { summary, campaigns } = state.data;
  // Budgets can be set before an ad account is connected (pacing then says there is no data yet).
  const budgets = <AdBudgets base={base} month={to.slice(0, 7)} canEdit={canSetBudgets} />;
  if (!sources.length && canManage) {
    return (
      <div className="flex flex-col gap-4">
        <PageSection id="ads-account" title="Meta Ads" description="Spend, purchases and ROAS from one Meta ad account.">
          <AdAccountPicker workspaceId={workspaceId} brandId={brandId} onSaved={onSourceChanged} />
        </PageSection>
        {budgets}
      </div>
    );
  }
  if (!sources.length) {
    return (
      <div className="flex flex-col gap-4">
        <EmptyState
          icon={Megaphone}
          title="No ad account connected"
          description="Connect a Meta ad account in Connections to see spend, purchases and ROAS here."
        />
        {budgets}
      </div>
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
        description={currencies ? `In the ad account's currency: ${currencies}. Before = ${dayLabel(summary.previousRange.from)} to ${dayLabel(summary.previousRange.to)}.` : undefined}
        actions={empty ? undefined : <ExportCsvButton url={`${base}/ads/export?format=xlsx&${range}`} label="Export Excel" filename={`ads-${from}-${to}.xlsx`} />}
        className="flex flex-col gap-4"
      >
        {sources.map((s) => (
          <SyncedAt key={s.id} source={s} syncUrl={`${base}/data-sources/${DATA_SOURCE_SLUGS.META_ADS}/sync`} name={sources.length > 1 && s.label ? s.label : undefined} onChanged={onSourceChanged} />
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
                      <tr key={`${c.accountId}:${c.campaignId}:${c.currency}`}>
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
        {summary.shopRevenueOverSpend ? <p className="text-sm">{ratioLine(summary.shopRevenueOverSpend)}</p> : null}
        <p className="text-xs text-muted-foreground">
          Purchases, purchase value and ROAS are as Meta reports them, with Ads Manager&rsquo;s default attribution.
          {zones ? ` Days are in the ad account's time zone (${zones}).` : null}
        </p>
      </PageSection>
      {budgets}
    </div>
  );
}

/**
 * Owners choose which connected Meta ad account (one connection per account) feeds the tab. GET meta-ads/accounts
 * reads Meta's live list so the choice shows its currency and zone, or that it is no longer readable; PUT data-sources/meta-ads checks it
 * again. 409 (reconnect, not readable) and 429 (too many tries) show the server's message.
 */
function AdAccountPicker({ workspaceId, brandId, onSaved }: { workspaceId: string; brandId: string; onSaved: () => void }) {
  const base = brandApi(workspaceId, brandId);
  const fetcher = useCallback(
    () => request<{ connections: Connection[] }>(connectionsUrl(workspaceId, brandId)).then((d) => d.connections.filter((c) => c.provider === "META_ADS" && c.status === "ACTIVE")),
    [workspaceId, brandId],
  );
  const { state, reload } = useLoad(fetcher);
  const [picked, setPicked] = useState("");
  const [live, setLive] = useState<{ id: string; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (state.kind === "loading") return <ListSkeleton label="Loading ad accounts" rows={1} />;
  if (state.kind === "forbidden") return <p className="text-sm text-muted-foreground">You can&apos;t choose the ad account.</p>;
  if (state.kind === "error") return <LoadError message={state.message} onRetry={reload} />;
  const accounts = state.data;
  if (!accounts.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect a Meta ad account first. <Link href="/connections" className="font-medium text-foreground underline underline-offset-2">Open Connections</Link>
      </p>
    );
  }

  const pick = async (id: string) => {
    setPicked(id);
    setLive(null);
    setError("");
    if (!id) return;
    try {
      // The login can read several accounts; the connection is one of them (`connectionAccountId`).
      const d = await request<MetaAdAccountsDto>(`${base}/meta-ads/accounts?connectionId=${encodeURIComponent(id)}`);
      const a = d.accounts.find((x) => x.id === d.connectionAccountId);
      setLive({ id, text: a ? `Reports in ${a.currency}, ${a.timeZone} days.` : "Meta doesn't list this account as active any more." });
    } catch (e) {
      setError(errorMessage(e, "Couldn't read the ad accounts. Try again."));
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await request<{ source: DataSourceDto }>(`${base}/data-sources/${DATA_SOURCE_SLUGS.META_ADS}`, { method: "PUT", body: JSON.stringify({ connectionId: picked } satisfies ChooseMetaAdAccountBody) });
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "Couldn't choose the ad account. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="ads-account-pick" className="text-sm font-medium">Ad account</label>
      <div className="flex flex-wrap items-center gap-2">
        <select id="ads-account-pick" className={cn(selectClass, "sm:w-auto sm:min-w-72")} value={picked} onChange={(e) => void pick(e.target.value)}>
          <option value="">Pick an ad account</option>
          {accounts.map((c) => <option key={c.id} value={c.id}>{c.displayName}</option>)}
        </select>
        <Button size="sm" disabled={busy || !picked} onClick={() => void save()}>{busy ? "Saving…" : "Use this account"}</Button>
      </div>
      {live?.id === picked ? <p className="text-xs text-muted-foreground">{live.text}</p> : null}
      <p className="text-xs text-muted-foreground">The first sync reads the last 180 days.</p>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
