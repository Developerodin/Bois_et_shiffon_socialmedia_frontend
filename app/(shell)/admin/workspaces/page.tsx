import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Ago, day, Empty, Money, PageHeader, Pager, SearchBox, Segmented, Table, withQuery } from "@/components/admin/ui";
import { requirePlatformAdminPage } from "@/server/auth/platform-admin";
import { listWorkspaces, pageCount, pageNumber, type WorkspaceSort } from "@/server/services/platform-admin";
import { usdInrRate } from "@/server/usage/fx";

export const metadata = { title: "Workspaces · Platform admin" };

const SORTS: { value: WorkspaceSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "spend", label: "Spend" },
  { value: "active", label: "Last active" },
  { value: "name", label: "Name" },
];
const usd30 = (s: { aiUsd30: number; apiUsd30: number }) => s.aiUsd30 + s.apiUsd30;
const count = (n: number) => (n ? n.toLocaleString("en") : <Empty />);

export default async function AdminWorkspaces({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  await requirePlatformAdminPage();
  const q = await searchParams;
  const sort = (SORTS.some((s) => s.value === q.sort) ? q.sort : "newest") as WorkspaceSort;
  const page = pageNumber(q.page);
  const [w, fx] = await Promise.all([listWorkspaces({ q: q.q, sort, page }), usdInrRate()]);
  const c30 = w.customers30;
  const current = { q: q.q, sort: sort === "newest" ? undefined : sort, page: page > 1 ? String(page) : undefined };

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Workspaces">
        {w.total.toLocaleString("en")} {q.q ? `matching “${q.q}”` : "in all"}. Spend is the last 30 days: AI calls plus other paid APIs; the bar is each workspace’s share.
      </PageHeader>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchBox placeholder="Search by name or owner email" value={q.q} hidden={{ sort: current.sort }} />
        <Segmented label="Sort by" options={SORTS} value={sort} href={(v) => withQuery("/admin/workspaces", current, { sort: v === "newest" ? undefined : v })} />
      </div>

      <Table
        wide
        head={["Workspace", "Projects", "People", "Credits", "AI calls (30 days)", "Spend (30 days)", "Last activity"]}
        numeric={[1, 2, 3, 4, 5, 6]}
        empty={q.q ? "No workspace matches that search." : "No workspaces yet."}
        rows={w.rows.map((x) => [
          <div key="w" className="min-w-0 max-w-xs">
            <Link href={`/admin/workspaces/${x.id}`} className="group inline-flex items-center gap-1 rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {x.name}
              <ArrowUpRight className="size-3.5 text-muted-foreground transition-transform group-hover:-translate-y-px group-hover:translate-x-px motion-reduce:transition-none" aria-hidden="true" />
            </Link>
            <p className="mt-0.5 truncate text-xs text-muted-foreground" title={x.owner?.email ?? undefined}>
              {x.owner?.email ?? "No owner"} · since {day(x.createdAt)}
            </p>
          </div>,
          count(x._count.brands),
          count(x._count.members),
          count(x.credits),
          count(x.spend.calls30),
          <Money key="m" usd={usd30(x.spend)} fx={fx} share={c30 ? usd30(x.spend) / c30 : undefined} />,
          <Ago key="a" at={x.lastActive} />,
        ])}
      />
      <Pager page={page} hasMore={w.hasMore} pages={pageCount(w.total)} href={(p) => withQuery("/admin/workspaces", current, { page: p > 1 ? String(p) : undefined })} />
    </>
  );
}
