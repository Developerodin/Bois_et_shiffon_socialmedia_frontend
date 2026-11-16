import type { AdminSpend } from "@espanda/shared";
import { SpendChart } from "@/components/admin/spend-chart";
import { SpendTables } from "@/components/admin/spend-tables";
import { fxOf, period as periodOf, PERIODS, Section, Segmented, Stat, withQuery, type Fx } from "@/components/admin/ui";
import { serverFetch } from "@/lib/server-fetch";

const dollars = (v: number) => `$${v.toFixed(v >= 100 ? 0 : v >= 1 ? 2 : 4)}`;
const rupees = (v: number, fx: Fx) => (fx ? `₹${(v * fx.rate).toFixed(v * fx.rate >= 100 ? 0 : 2)}` : null);

/** Spend & usage for the platform (no workspaceId) or one workspace: period and test-run switches, chart, breakdowns. */
export async function SpendView({ path, query, workspaceId }: { path: string; query: { days?: string; tests?: string }; workspaceId?: string }) {
  const { value: period, param, span } = periodOf(query.days);
  const tests = !workspaceId && query.tests === "1";
  const s = await serverFetch<AdminSpend>(withQuery("/api/v1/admin/spend", {}, { ...query, workspaceId }));
  const fx = fxOf(s.usdInr);
  const current = { days: param, tests: tests ? "1" : undefined };
  const total = s.aiUsd + s.apiUsd;

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Segmented label="Period" options={PERIODS} value={period} href={(v) => withQuery(path, current, { days: v === "30" ? undefined : v })} />
        {workspaceId ? null : (
          <Segmented
            label="Test runs"
            options={[{ value: "", label: "Customers only" }, { value: "1", label: "With test runs" }]}
            value={tests ? "1" : ""}
            href={(v) => withQuery(path, current, { tests: v || undefined })}
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat label={`Spend, ${span}`} value={dollars(total)} hint={rupees(total, fx) ?? undefined} />
        <Stat label="AI calls" value={s.calls.toLocaleString("en")} hint={`AI ${dollars(s.aiUsd)}`} />
        <Stat label="Other paid API calls" value={s.apiCalls.toLocaleString("en")} hint={`${dollars(s.apiUsd)} (Google Places, Twilio)`} />
        <Stat label="Input read from cache" value={s.input ? `${Math.round((100 * s.cached) / s.input)}%` : "–"} hint={`${s.input.toLocaleString("en")} input tokens`} />
      </div>

      <Section id="trend" title={`Spend per day, ${span}`} description={`${workspaceId ? "" : tests ? "Customers and test runs. " : "Customers only. "}AI calls plus other paid APIs; hover a day for the split.`}>
        <SpendChart days={s.days} fx={fx} title={`Spend per day, ${span}`} />
      </Section>

      <Section id="breakdown" title="Where it goes" description={`${span[0].toUpperCase()}${span.slice(1)}, at list price. The bars show each row’s share of AI spend.`}>
        <SpendTables s={s} fx={fx} workspaceLinks={!workspaceId} />
      </Section>
    </>
  );
}
