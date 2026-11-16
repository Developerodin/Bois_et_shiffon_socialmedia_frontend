import Link from "next/link";
import type { AdminLogsResponse, AdminSpend, AdminWorkspaceDetail } from "@espanda/shared";
import { LogTable } from "@/components/admin/log-table";
import { SpendChart } from "@/components/admin/spend-chart";
import { fxOf, Section, Stat, withQuery, type Fx } from "@/components/admin/ui";
import { api, serverFetch } from "@/lib/server-fetch";

export const metadata = { title: "Workspace · Platform admin" };

const dollars = (v: number) => `$${v.toFixed(v >= 100 ? 0 : v >= 1 ? 2 : 4)}`;
const rupees = (v: number, fx: Fx) => (fx ? `₹${(v * fx.rate).toFixed(v * fx.rate >= 100 ? 0 : 2)}` : null);
const more = "text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline";

export default async function AdminWorkspaceOverview({ params }: { params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  const [d, spend, activity, runs] = await Promise.all([
    serverFetch<AdminWorkspaceDetail>(api`/api/v1/admin/workspaces/${workspaceId}`),
    serverFetch<AdminSpend>(withQuery("/api/v1/admin/spend", {}, { workspaceId })), // the default period is the last 30 days
    serverFetch<AdminLogsResponse>(withQuery("/api/v1/admin/logs", {}, { workspaceId })),
    serverFetch<AdminLogsResponse>(withQuery("/api/v1/admin/logs", {}, { workspaceId, log: "runs" })),
  ]);
  const fx = fxOf(spend.usdInr);
  const base = `/admin/workspaces/${workspaceId}`;
  const s30 = spend.aiUsd + spend.apiUsd;

  return (
    <>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Stat href={`${base}/people`} label="People" value={d.members.length.toLocaleString("en")} hint={d.invitations.length ? `${d.invitations.length} invitation${d.invitations.length === 1 ? "" : "s"} pending` : "no invitations pending"} />
        <Stat href={`${base}/projects`} label="Projects" value={d.brands.length.toLocaleString("en")} hint={`${d.credits.toLocaleString("en")} credits left`} />
        <Stat href={`${base}/spend`} label="Spend, last 30 days" value={dollars(s30)} hint={rupees(s30, fx) ?? undefined} />
        <Stat href={`${base}/logs?log=calls`} label="AI calls, last 30 days" value={spend.calls.toLocaleString("en")} hint={`${spend.apiCalls.toLocaleString("en")} other paid API calls`} />
      </div>

      <Section id="trend" title="Spend per day, last 30 days" description="AI calls plus other paid APIs. Hover a day for the split.">
        <SpendChart days={spend.days} fx={fx} title={`${d.workspace.name}: spend per day, last 30 days`} />
      </Section>

      <div className="flex flex-col gap-10">
        <Section id="activity" title="Latest activity">
          <LogTable kind="audit" rows={activity.rows.slice(0, 8)} fx={fx} />
          <Link href={`${base}/logs`} className={more}>
            Audit log
          </Link>
        </Section>
        <Section id="runs" title="Recent agent runs">
          <LogTable kind="runs" rows={runs.rows.slice(0, 8)} fx={fx} />
          <Link href={`${base}/logs?log=runs`} className={more}>
            All agent runs
          </Link>
        </Section>
      </div>
    </>
  );
}
