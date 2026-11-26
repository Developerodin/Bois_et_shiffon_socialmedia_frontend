"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { Table } from "@/components/admin/table";
import { money, Stat } from "@/components/data/shared";
import { SyncedAt, useReloadWhenSynced } from "@/components/data/synced-at";
import { connectionsUrl, errorMessage, request, type Connection } from "@/components/settings/api";
import { ListSkeleton, LoadError, useLoad } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { PageSection } from "@/components/ui/page-section";
import { brandApi, change, rangeQuery, useReloadOnFocus, type DateRange } from "@/lib/data-api";
import { DATA_SOURCE_SLUGS, type DataSourceDto, type SalesCurrency, type SalesSummaryDto, type SalesTotals, type TurnOnShopifyOrdersBody } from "@/shared";

const aov = (t: SalesTotals) => (t.orders ? Number(t.netSales) / t.orders : 0);
const DAY = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const dayLabel = (d: string) => DAY.format(new Date(`${d}T00:00:00Z`));

/**
 * Shopify orders and revenue per brand-local day, one block per currency (never added across currencies). Totals are as
 * Shopify reports them, VAT included where the shop's prices include it. `source` undefined = orders not turned on.
 */
export function SalesTab({ workspaceId, brandId, range, source, canManage, onSourceChanged }: { workspaceId: string; brandId: string; range: DateRange; source: DataSourceDto | undefined; canManage: boolean; onSourceChanged: () => void }) {
  const base = brandApi(workspaceId, brandId);
  if (!source) {
    return (
      <PageSection id="sales-off" title="Sales" description="Orders and revenue from Shopify, without customer details.">
        {canManage ? <TurnOnOrders workspaceId={workspaceId} brandId={brandId} onDone={onSourceChanged} /> : <p className="text-sm text-muted-foreground">Orders aren&apos;t turned on yet. Ask a workspace owner to turn them on.</p>}
      </PageSection>
    );
  }
  return <SalesNumbers base={base} range={range} source={source} onSourceChanged={onSourceChanged} />;
}

function SalesNumbers({ base, range, source, onSourceChanged }: { base: string; range: DateRange; source: DataSourceDto; onSourceChanged: () => void }) {
  const { from, to } = range; // the parent makes a new range object each render; refetch on its days only
  const fetcher = useCallback(() => request<SalesSummaryDto>(`${base}/sales/summary?${rangeQuery(from, to)}`), [base, from, to]);
  const { state, reload } = useLoad(fetcher);
  useReloadOnFocus(reload, state);
  useReloadWhenSynced([source], reload);

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading sales" />;
  else if (state.kind === "forbidden") body = <p className="text-sm text-muted-foreground">You can&apos;t see sales.</p>;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else if (!state.data.currencies.length) body = <p className="text-sm text-muted-foreground">No orders in these days. The first sync reads the last 60 days and takes a few minutes.</p>;
  else body = <div className="flex flex-col gap-6">{state.data.currencies.map((c) => <CurrencyBlock key={c.currency} c={c} several={state.data.currencies.length > 1} />)}</div>;

  return (
    <PageSection
      id="sales"
      title="Sales"
      className="flex flex-col gap-4"
      description={
        <div className="flex flex-col gap-1">
          <SyncedAt source={source} syncUrl={`${base}/data-sources/${DATA_SOURCE_SLUGS.SHOPIFY_ORDERS}/sync`} onChanged={onSourceChanged} />
          <p className="text-xs text-muted-foreground">
            {source.label ? `${source.label} · ` : ""}Days in the brand&apos;s time zone. Test and cancelled orders left out; amounts include VAT where the shop&apos;s prices do.
          </p>
        </div>
      }
    >
      {body}
    </PageSection>
  );
}

function CurrencyBlock({ c, several }: { c: SalesCurrency; several: boolean }) {
  const m = (v: string | number) => money(v, c.currency);
  const { totals: now, previous: before } = c;
  return (
    <div className="flex flex-col gap-3">
      {several ? <h3 className="text-sm font-medium">In {c.currency}</h3> : null}
      {/* Columns follow the section's own width (the sidebar and assistant take part of the window): five only where the amounts fit. */}
      <div className="@container rounded-xl bg-muted/40 px-4 py-3">
        <div className="grid grid-cols-2 gap-x-6 gap-y-4 @xl:grid-cols-3 @4xl:grid-cols-5">
          <Stat label="Orders" value={now.orders.toLocaleString()} before={before.orders.toLocaleString()} delta={change(now.orders, before.orders)} />
          <Stat label="Net sales" value={m(now.netSales)} before={m(before.netSales)} delta={change(Number(now.netSales), Number(before.netSales))} />
          <Stat label="Gross sales" value={m(now.gross)} before={m(before.gross)} delta={change(Number(now.gross), Number(before.gross))} />
          <Stat label="Average order (net)" value={m(aov(now))} before={m(aov(before))} delta={change(aov(now), aov(before))} />
          <Stat label="Refunded" value={m(now.refunded)} before={m(before.refunded)} />
        </div>
      </div>
      <details className="text-sm" open>
        <summary className="cursor-pointer py-1 text-xs text-muted-foreground hover:text-foreground print:hidden">By day</summary>
        <div className="mt-2">
          <Table
            head={["Day", "Orders", "Net sales", "Gross sales", "Refunded"]}
            numeric={[1, 2, 3, 4]}
            empty="No orders in this range."
            rows={c.days.map((d) => [dayLabel(d.day), d.orders.toLocaleString(), m(d.netSales), m(d.gross), m(d.refunded)])}
          />
        </div>
      </details>
    </div>
  );
}

/** Turn on orders for the brand's Shopify store. The server checks the stored token has read_orders (422 says how to add it). */
function TurnOnOrders({ workspaceId, brandId, onDone }: { workspaceId: string; brandId: string; onDone: () => void }) {
  const fetcher = useCallback(() => request<{ connections: Connection[] }>(connectionsUrl(workspaceId, brandId)), [workspaceId, brandId]);
  const { state, reload } = useLoad(fetcher);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  if (state.kind === "loading") return <ListSkeleton label="Loading connections" rows={1} />;
  if (state.kind === "forbidden") return <p className="text-sm text-muted-foreground">You can&apos;t turn on orders.</p>;
  if (state.kind === "error") return <LoadError message={state.message} onRetry={reload} />;
  const shops = state.data.connections.filter((c) => c.provider === "SHOPIFY" && c.status === "ACTIVE");
  const shop = shops.find((c) => c.via !== "mcp");
  if (!shop && shops.length) {
    // Shopify MCP reads products only.
    return (
      <p className="text-sm text-muted-foreground">
        Orders need our app (AskCart). {shops[0].displayName} is connected through Shopify MCP, which reads products only.{" "}
        <Link href="/connections" className="font-medium text-foreground underline underline-offset-2">Open Connections</Link>
      </p>
    );
  }
  if (!shop) {
    return (
      <p className="text-sm text-muted-foreground">
        Connect Shopify first. <Link href="/connections" className="font-medium text-foreground underline underline-offset-2">Open Connections</Link>
      </p>
    );
  }

  const turnOn = async () => {
    setBusy(true);
    setError("");
    try {
      await request<{ source: DataSourceDto }>(`${brandApi(workspaceId, brandId)}/data-sources/${DATA_SOURCE_SLUGS.SHOPIFY_ORDERS}`, { method: "PUT", body: JSON.stringify({ connectionId: shop.id } satisfies TurnOnShopifyOrdersBody) });
      onDone();
    } catch (e) {
      setError(errorMessage(e, "Couldn't turn on orders. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <p className="text-sm text-muted-foreground">Read order totals from {shop.displayName}: no customer names, emails or addresses. The first sync reads the last 60 days.</p>
      <Button size="sm" disabled={busy} onClick={() => void turnOn()}>{busy ? "Turning on…" : "Turn on orders"}</Button>
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
