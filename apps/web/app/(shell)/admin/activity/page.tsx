import Link from "next/link";
import { ActivityPickers } from "@/components/admin/activity-pickers";
import { Ago, Empty, Money, PageHeader, Pager, period as periodOf, PERIODS, Segmented, Table, withQuery } from "@/components/admin/ui";
// eslint-disable-next-line no-restricted-imports -- converted in task 4
import { requirePlatformAdminPage } from "@/server/auth/platform-admin";
// eslint-disable-next-line no-restricted-imports -- converted in task 4
import { activityList, NO_WORKSPACE, type ActivitySort } from "@/server/services/activity";
// eslint-disable-next-line no-restricted-imports -- converted in task 4
import { PAGE, pageCount, pageNumber, peopleMatching, pickerOptions } from "@/server/services/platform-admin";
// eslint-disable-next-line no-restricted-imports -- converted in task 4
import { usdInrRate } from "@/server/usage/fx";

export const metadata = { title: "Activity · Platform admin" };

const SORTS: { value: ActivitySort; label: string }[] = [
  { value: "active", label: "Last active" },
  { value: "visits", label: "Visits" },
  { value: "actions", label: "Actions" },
  { value: "tasks", label: "Agent tasks" },
  { value: "spend", label: "Spend" },
];
const count = (n: number, key: string) => (n ? n.toLocaleString("en") : <Empty key={key} />);

/** What each person does in each workspace: visits, actions, agent tasks and spend. Never chat text. */
export default async function AdminActivity({ searchParams }: { searchParams: Promise<{ ws?: string; who?: string; days?: string; sort?: string; page?: string }> }) {
  await requirePlatformAdminPage();
  const q = await searchParams;
  const ws = q.ws || undefined;
  const who = q.who?.trim() || undefined;
  const { value: days, days: n, param, span } = periodOf(q.days);
  const sort = (SORTS.some((s) => s.value === q.sort) ? q.sort : "active") as ActivitySort;
  const page = pageNumber(q.page);
  const [a, options, fx] = await Promise.all([peopleMatching(who).then((userIds) => activityList({ workspaceId: ws, userIds, days: n, sort, page })), pickerOptions(), usdInrRate()]);
  const current = { ws, who, days: param, sort: sort === "active" ? undefined : sort, page: page > 1 ? String(page) : undefined };

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Activity">
        {a.total.toLocaleString("en")} {a.total === 1 ? "row" : "rows"}, {span}: one per person per workspace, {PAGE} a page, plus each workspace’s unattributed activity. Open someone for their timeline. Chat text is never shown.
      </PageHeader>
      <div className="flex flex-col gap-3">
        <ActivityPickers ws={ws} who={who} options={options} hidden={{ days: param, sort: current.sort }} />
        <div className="flex flex-wrap items-center gap-3">
          <Segmented label="Period" options={PERIODS} value={days} href={(v) => withQuery("/admin/activity", current, { days: v === "30" ? undefined : v })} />
          <Segmented label="Sort by" options={SORTS} value={sort} href={(v) => withQuery("/admin/activity", current, { sort: v === "active" ? undefined : v })} />
        </div>
      </div>
      <Table
        wide
        head={["Person", "Workspace", "Last active", "Page visits", "Actions", "Agent tasks", "Spend"]}
        numeric={[3, 4, 5, 6]}
        empty={who ? "Nobody matching that search did anything in this period." : "No activity in this period."}
        rows={a.rows.map((r) => [
          r.userId ? (
            <Link key="p" href={withQuery(`/admin/activity/${r.userId}`, {}, { ws: r.workspaceId ?? NO_WORKSPACE, days: param })} className="font-medium underline-offset-4 hover:underline">
              {r.who}
            </Link>
          ) : (
            <div key="p">
              <span className="font-medium">Unattributed</span>
              <p className="text-xs text-muted-foreground">system runs, removed test accounts, or before people were recorded</p>
            </div>
          ),
          r.workspace ?? <span key="w" className="text-muted-foreground">no workspace</span>,
          <Ago key="l" at={r.last} />,
          count(r.visits, "v"),
          count(r.actions, "a"),
          count(r.tasks, "t"),
          <Money key="s" usd={r.usd} fx={fx} />,
        ])}
      />
      <Pager page={page} hasMore={a.hasMore} pages={pageCount(a.total)} href={(n) => withQuery("/admin/activity", current, { page: n > 1 ? String(n) : undefined })} />
    </>
  );
}
