import Link from "next/link";
import type { AdminLogsResponse, AdminOverview as Overview, AdminSpend } from "@espanda/shared";
import { LogTable } from "@/components/admin/log-table";
import { SpendChart } from "@/components/admin/spend-chart";
import { Ago, fxOf, Money, PageHeader, Section, Stat, Table, type Fx } from "@/components/admin/ui";
import { serverFetch } from "@/lib/server-fetch";

export const metadata = { title: "Platform admin" };

const usd30 = (s: { aiUsd30: number; apiUsd30: number }) => s.aiUsd30 + s.apiUsd30;
const dollars = (v: number) => `$${v.toFixed(v >= 100 ? 0 : v >= 1 ? 2 : 4)}`;
const rupees = (v: number, fx: Fx) => (fx ? `₹${(v * fx.rate).toFixed(v * fx.rate >= 100 ? 0 : 2)}` : null);
const more = "text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

/** The console's front page: the numbers that matter, the last 30 days of spend, who costs most, what just happened. */
export default async function AdminOverview() {
  const [o, spend, activity] = await Promise.all([
    serverFetch<Overview>("/api/v1/admin/overview"),
    serverFetch<AdminSpend>("/api/v1/admin/spend"), // the default period is the last 30 days
    serverFetch<AdminLogsResponse>("/api/v1/admin/logs"),
  ]);
  const fx = fxOf(o.usdInr);
  const c30 = usd30(o.customers);
  const top = o.top;

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Overview">
        Every workspace on Espanda. Read-only: opening a workspace or a person adds an entry to the audit log.
      </PageHeader>

      {/* Customers and the test set apart: test runs can cost hundreds of times what customers do. */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat href="/admin/workspaces" label="Workspaces" value={o.workspaceCount.toLocaleString("en")} hint={`${o.users.toLocaleString("en")} people`} />
        <Stat href="/admin/spend" label="Customer spend, last 30 days" value={dollars(c30)} hint={[rupees(c30, fx), `all time ${dollars(o.customers.aiUsd + o.customers.apiUsd)}`].filter(Boolean).join(" · ")} />
        <Stat href="/admin/logs?log=calls" label="AI calls, last 30 days" value={o.customers.calls30.toLocaleString("en")} hint={`${o.customers.apiCalls30.toLocaleString("en")} other paid API calls`} />
        <Stat href="/admin/spend?tests=1" label="Test runs, last 30 days" value={dollars(usd30(o.tests))} hint={`${o.tests.calls30.toLocaleString("en")} calls (npm run eval)`} />
      </div>

      <Section id="trend" title="Spend per day, last 30 days" description="Customers only (test runs left out): AI calls plus other paid APIs. Hover a day for the split.">
        <SpendChart days={spend.days} fx={fx} title="Customer spend per day, last 30 days" />
      </Section>

      <div className="flex flex-col gap-10">
        <Section id="top" title="Costliest workspaces, last 30 days">
          <Table
            head={["Workspace", "AI calls", "Spend", "Last activity"]}
            numeric={[1, 2, 3]}
            empty="No workspaces yet."
            rows={top.map((w) => [
              <Link key="n" href={`/admin/workspaces/${w.id}`} className="font-medium underline-offset-4 hover:underline">
                {w.name}
              </Link>,
              w.spend.calls30.toLocaleString("en"),
              <Money key="m" usd={usd30(w.spend)} fx={fx} share={c30 ? usd30(w.spend) / c30 : undefined} />,
              <Ago key="a" at={w.lastActive} />,
            ])}
          />
          <Link href="/admin/workspaces" className={more}>
            All {o.workspaceCount.toLocaleString("en")} workspaces
          </Link>
        </Section>
        <Section id="activity" title="Latest activity" description="Sign-ins, role changes, approvals and admin visits, across the platform.">
          <LogTable kind="audit" rows={activity.rows.slice(0, 8)} fx={fx} platform />
          <Link href="/admin/logs" className={more}>
            All logs
          </Link>
        </Section>
      </div>

      <footer className="max-w-prose border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
        Spend is list price from the usage ledger{fx ? `, in rupees at ₹${fx.rate.toFixed(2)} per dollar` : ""}.
        {o.unpriced ? ` ${o.unpriced.toLocaleString("en")} AI calls from before costs were stored aren’t counted; the usage report (npm run usage -w web) prices them from their tokens.` : ""}
      </footer>
    </>
  );
}
