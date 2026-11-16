import Link from "next/link";
import type { AdminSpend } from "@espanda/shared";
import { Empty, Money, Table, type Fx } from "@/components/admin/ui";

const COMPACT = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const compact = (n: number) => (n ? COMPACT.format(n) : <Empty />);
const count = (n: number) => (n ? n.toLocaleString("en") : <Empty key="n" />);

/** Every breakdown of the spend response, as tables. `workspaceLinks`: link workspace rows to their pages. */
export function SpendTables({ s, fx, workspaceLinks }: { s: AdminSpend; fx: Fx; workspaceLinks?: boolean }) {
  const aiTotal = s.aiUsd || 1;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        {s.byWorkspace.length ? (
          <Table
            head={["Workspace", "AI calls", "AI spend"]}
            numeric={[1, 2]}
            empty="No AI calls."
            rows={s.byWorkspace.map((r) => [
              workspaceLinks && r.id && r.name !== "Test runs" && r.name !== "Deleted workspace" ? (
                <Link key="n" href={`/admin/workspaces/${r.id}/spend`} className="font-medium underline-offset-4 hover:underline">
                  {r.name}
                </Link>
              ) : (
                r.name
              ),
              count(r.calls),
              <Money key="m" usd={r.usd} fx={fx} share={r.usd / aiTotal} />,
            ])}
          />
        ) : (
          <Table head={["Project", "AI calls", "AI spend"]} numeric={[1, 2]} empty="No AI calls." rows={s.byBrand.map((r) => [r.name, count(r.calls), <Money key="m" usd={r.usd} fx={fx} share={r.usd / aiTotal} />])} />
        )}
        <div className="flex flex-col gap-4">
          <Table head={["Tier", "AI calls", "AI spend"]} numeric={[1, 2]} empty="No AI calls." rows={s.byTier.map((r) => [<span key="t" className="capitalize">{r.tier}</span>, count(r.calls), <Money key="m" usd={r.usd} fx={fx} />])} />
          <Table head={["Other paid API", "Calls", "Spend"]} numeric={[1, 2]} empty="No other paid API calls." rows={s.byApi.map((r) => [r.api, count(r.calls), <Money key="m" usd={r.usd} fx={fx} />])} />
        </div>
      </div>
      <Table
        wide
        head={["Model", "Calls", "Input tokens", "From cache", "Output tokens", "Spend"]}
        numeric={[1, 2, 3, 4, 5]}
        empty="No AI calls."
        rows={s.byModel.map((r) => [<span key="m" className="font-mono text-xs">{r.model}</span>, count(r.calls), compact(r.input), r.input ? `${Math.round((100 * r.cached) / r.input)}%` : <Empty key="c" />, compact(r.output), <Money key="u" usd={r.usd} fx={fx} />])}
      />
      <Table head={["Task (top 25 by spend)", "Calls", "Spend"]} numeric={[1, 2]} empty="No AI calls." rows={s.byTask.map((r) => [<span key="t" className="font-mono text-xs">{r.task}</span>, count(r.calls), <Money key="u" usd={r.usd} fx={fx} />])} />
    </div>
  );
}
