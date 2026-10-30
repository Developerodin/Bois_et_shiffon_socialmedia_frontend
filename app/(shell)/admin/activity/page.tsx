import Link from "next/link";
import { ActivityPickers } from "@/components/admin/activity-pickers";
import { Ago, Empty, Money, PageHeader, Pager, Table, withQuery } from "@/components/admin/ui";
import { requirePlatformAdminPage } from "@/server/auth/platform-admin";
import { activityList, NO_WORKSPACE } from "@/server/services/activity";
import { PAGE, pageNumber, pickerOptions } from "@/server/services/platform-admin";
import { usdInrRate } from "@/server/usage/fx";

export const metadata = { title: "Activity · Platform admin" };

const count = (n: number, key: string) => (n ? n.toLocaleString("en") : <Empty key={key} />);

/** What each person does in each workspace: visits, actions, agent tasks and spend. Never chat text. */
export default async function AdminActivity({ searchParams }: { searchParams: Promise<{ ws?: string; user?: string; page?: string }> }) {
  await requirePlatformAdminPage();
  const q = await searchParams;
  const ws = q.ws || undefined;
  const user = q.user || undefined;
  const page = pageNumber(q.page);
  const [a, options, fx] = await Promise.all([activityList({ workspaceId: ws, userId: user, page }), pickerOptions(ws, user), usdInrRate()]);
  const current = { ws, user, page: page > 1 ? String(page) : undefined };

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Activity">
        One row per person per workspace, most recently active first, {PAGE} a page, plus each workspace’s unattributed activity. Open someone for their timeline. Chat text is never shown.
      </PageHeader>
      <ActivityPickers ws={ws} user={user} options={options} />
      <Table
        wide
        head={["Person", "Workspace", "Last active", "Page visits", "Actions", "Agent tasks", "Spend"]}
        numeric={[3, 4, 5, 6]}
        empty="No activity recorded yet."
        rows={a.rows.map((r) => [
          r.userId ? (
            <Link key="p" href={withQuery(`/admin/activity/${r.userId}`, {}, { ws: r.workspaceId ?? NO_WORKSPACE })} className="font-medium underline-offset-4 hover:underline">
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
      <Pager page={page} hasMore={a.hasMore} href={(n) => withQuery("/admin/activity", current, { page: n > 1 ? String(n) : undefined })} />
    </>
  );
}
