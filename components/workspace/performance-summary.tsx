"use client";

import { useCallback } from "react";
import Link from "next/link";
import { rangeLabel } from "@/components/data/date-range";
import { money, Stat } from "@/components/data/shared";
import { ADS_CURRENCY_NOTE } from "@/components/performance/ads-tab";
import { exVatNotes } from "@/components/performance/sales-tab";
import { request } from "@/components/settings/api";
import { ListSkeleton, useLoad } from "@/components/settings/shared";
import { LoadFailed } from "@/components/ui/load-failed";
import { defaultRange, rangeQuery, type DateRange } from "@/lib/data-api";
import { adsView, salesView, type SourceState } from "@/lib/performance-summary";
import type { AdsSummaryDto, DataSourceDto, DataSourcesDto, SalesSummaryDto } from "@/shared";

const synced = (s: DataSourceDto) => s.status !== "OFF" && !!s.lastResult?.okAt;
const roas = (v: number | null) => (v == null ? "—" : `${v.toFixed(2)}×`);
const linkClass = "font-medium text-primary-strong underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const tileClass = "-mx-2 block rounded-lg px-2 py-1 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * The Overview's key numbers for the Performance page's default range (28 days to yesterday, defaultRange), each a
 * link to its tab on the same days: Meta ad spend and ROAS (flag `ads` + ads.read) and Shopify net sales without VAT
 * and orders (flag `sales` + crm.read). A summary is fetched only for a gate that is open and a source that has synced,
 * never to be hidden. Read once (and on Retry); the fetcher is keyed on the brand and gates only, since Home re-renders
 * every few seconds. Customer follow-ups have no data yet, so they aren't shown.
 */
export function PerformanceSummary({ base, ads, sales }: { base: string; ads: boolean; sales: boolean }) {
  const fetcher = useCallback(async () => {
    const ds = await request<DataSourcesDto>(`${base}/data-sources`);
    const range = defaultRange(ds.timeZone);
    const q = rangeQuery(range.from, range.to);
    const meta = ds.sources.filter((s) => s.kind === "META_ADS");
    const shop = ds.sources.find((s) => s.kind === "SHOPIFY_ORDERS");
    const [adsSummary, salesSummary] = await Promise.all([
      ads && meta.some(synced) ? request<AdsSummaryDto>(`${base}/ads/summary?${q}`) : null,
      sales && shop && synced(shop) ? request<SalesSummaryDto>(`${base}/sales/summary?${q}`) : null,
    ]);
    return { range, meta, shop, adsSummary, salesSummary };
  }, [base, ads, sales]);
  const { state, reload } = useLoad(ads || sales ? fetcher : null);
  if (!ads && !sales) return null;

  let body: React.ReactNode;
  let range: DateRange | null = null;
  if (state.kind === "loading") body = <ListSkeleton label="Loading the key numbers" rows={1} />;
  else if (state.kind === "forbidden") body = <p className="text-sm text-muted-foreground">Your role doesn&rsquo;t include these numbers.</p>;
  else if (state.kind === "error") body = <LoadFailed what="the key numbers" onRetry={reload} />;
  else {
    const d = state.data;
    range = d.range;
    const href = (tab: "ads" | "sales") => `/performance?tab=${tab}&${rangeQuery(d.range.from, d.range.to)}`;
    body = (
      <div className="flex flex-col gap-5">
        {ads && (
          <Block
            title="Meta Ads"
            note={`${ADS_CURRENCY_NOTE}; ROAS as Meta reports it`}
            href={href("ads")}
            state={adsView(d.meta, d.adsSummary)}
            none="No ad account connected."
            empty="No ad spend in these days."
            tiles={(f) => [
              { label: "Ad spend", value: money(f.spend, f.currency) },
              { label: "ROAS", value: roas(f.roas) },
            ]}
          />
        )}
        {sales && (
          <Block
            title="Sales"
            note="Shopify orders, test and cancelled left out"
            href={href("sales")}
            state={salesView(d.shop, d.salesSummary)}
            none="Orders aren't turned on."
            empty="No orders in these days."
            tiles={(f) => [
              {
                label: "Net sales (excl. VAT)",
                value: f.netExVat === null ? "—" : money(f.netExVat, f.currency),
                note: f.netExVat === null ? "Excl. VAT not available for these days yet" : exVatNotes(f).join(" · ") || undefined,
              },
              { label: "Orders", value: f.orders.toLocaleString() },
            ]}
          />
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="perf-h" className="px-5 pb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h2 id="perf-h" className="text-base font-semibold">
          Performance
        </h2>
        {range && <span className="text-xs text-muted-foreground">Last 28 days · {rangeLabel(range)}</span>}
      </div>
      <div className="mt-4">{body}</div>
    </section>
  );
}

type Tile = { label: string; value: string; note?: string };

/** One source: its figures as links to its tab, or in words why there are none. */
function Block<T extends { currency: string }>({ title, note, href, state, none, empty, tiles }: { title: string; note: string; href: string; state: SourceState<T>; none: string; empty: string; tiles: (f: T) => Tile[] }) {
  const open = (
    <Link href={href} className={linkClass}>
      Open {title}
    </Link>
  );
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {state.kind === "none" ? (
        <p className="text-sm text-muted-foreground">
          {none} {open}
        </p>
      ) : state.kind === "waiting" ? (
        <p className="text-sm text-muted-foreground">
          {state.text}. {open}
        </p>
      ) : state.kind === "empty" ? (
        <p className="text-sm text-muted-foreground">
          {empty} {open}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-x-6 gap-y-3">
          {state.items.flatMap((f) =>
            tiles(f).map((t) => {
              // Several currencies are never added up: each tile names its own.
              const label = state.items.length > 1 ? `${t.label} (${f.currency})` : t.label;
              return (
                <li key={`${f.currency}:${t.label}`}>
                  <Link href={href} className={tileClass} aria-label={`${label}: ${t.value}. Open ${title}`}>
                    <Stat label={label} value={t.value} />
                  </Link>
                  {t.note && <p className="mt-0.5 text-xs text-muted-foreground">{t.note}</p>}
                </li>
              );
            }),
          )}
        </ul>
      )}
      {state.kind !== "none" && (
        <p className="text-xs text-muted-foreground">
          {[state.kind === "waiting" ? null : state.status, note].filter(Boolean).join(" · ")}
        </p>
      )}
    </div>
  );
}
