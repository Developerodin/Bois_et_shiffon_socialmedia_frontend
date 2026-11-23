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
import { Stat } from "@/components/data/shared";
import { SyncedAt } from "@/components/data/synced-at";
import { brandApi, change, KIND_SLUG, rangeQuery, useReloadOnFocus, type DataSourceDto } from "@/lib/data-api";

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

const num = (v: string | number | null | undefined) => (v == null ? null : Number(v));

function Totals({ now, prev }: { now: AdsTotalsDto; prev: AdsTotalsDto | undefined }) {
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
/** `canManage` (integrations.manage): with no ad account chosen yet, pick one of the connected Meta ad accounts. */
export function AdsTab({ workspaceId, brandId, from, to, canManage = false }: { workspaceId: string; brandId: string; from: string; to: string; canManage?: boolean }) {
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
  useReloadOnFocus(reload, state);

  if (state.kind === "loading") return <ListSkeleton label="Loading ad results" />;
  if (state.kind === "forbidden") return <EmptyState icon={Megaphone} title="You can't see ad results" description="Ask a workspace owner for access." />;
  if (state.kind === "error") return <LoadError message={state.message} onRetry={reload} />;

  const { sources, summary, campaigns } = state.data;
  if (!sources.length && canManage) {
    return (
      <PageSection id="ads-account" title="Meta Ads" description="Spend, purchases and ROAS from one Meta ad account.">
        <AdAccountPicker workspaceId={workspaceId} brandId={brandId} onSaved={reload} />
      </PageSection>
    );
  }
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
          <SyncedAt key={s.id} source={s} syncUrl={`${base}/data-sources/${KIND_SLUG.META_ADS}/sync`} name={sources.length > 1 && s.label ? s.label : undefined} />
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

/**
 * Owners choose which connected Meta ad account (one connection per account) feeds the tab. GET meta-ads/accounts
 * reads Meta's live list so the choice shows its currency and zone, or that it is no longer readable; PUT checks it
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
    const conn = accounts.find((c) => c.id === id);
    try {
      const d = await request<{ accounts: { id: string; name: string; currency: string; timeZone: string }[] }>(`${base}/meta-ads/accounts?connectionId=${encodeURIComponent(id)}`);
      const a = d.accounts.find((x) => x.name === conn?.displayName);
      setLive({ id, text: a ? `Reports in ${a.currency}, ${a.timeZone} days.` : "Meta doesn't list this account as active any more." });
    } catch (e) {
      setError(errorMessage(e, "Couldn't read the ad accounts. Try again."));
    }
  };
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await request(`${base}/meta-ads/accounts`, { method: "PUT", body: JSON.stringify({ connectionId: picked }) });
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
      <p className="text-xs text-muted-foreground">The first sync reads the last 90 days.</p>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
