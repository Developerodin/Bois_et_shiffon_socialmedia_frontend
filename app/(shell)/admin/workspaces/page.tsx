import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { type AdminWorkspaces, type WorkspaceSort } from "@espanda/shared";
import { Ago, day, Empty, fxOf, Money, PageHeader, Pager, SearchBox, Segmented, Table, withQuery } from "@/components/admin/ui";
import { serverFetch } from "@/lib/server-fetch";

export const metadata = { title: "Workspaces · Platform admin" };

const SORTS: { value: WorkspaceSort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "spend", label: "Spend" },
  { value: "active", label: "Last active" },
  { value: "name", label: "Name" },
];
const usd30 = (s: { aiUsd30: number; apiUsd30: number }) => s.aiUsd30 + s.apiUsd30;
const count = (n: number, key: string) => (n ? n.toLocaleString("en") : <Empty key={key} />);

export default async function AdminWorkspaces({ searchParams }: { searchParams: Promise<{ q?: string; sort?: string; page?: string }> }) {
  const q = await searchParams;
  const sort = (SORTS.some((s) => s.value === q.sort) ? q.sort : "newest") as WorkspaceSort;
  const w = await serverFetch<AdminWorkspaces>(withQuery("/api/v1/admin/workspaces", {}, q));
  const { page } = w;
  const fx = fxOf(w.usdInr);
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
          count(x._count.brands, "b"),
          count(x._count.members, "p"),
          count(x.credits, "c"),
          count(x.spend.calls30, "n"),
          <Money key="m" usd={usd30(x.spend)} fx={fx} share={c30 ? usd30(x.spend) / c30 : undefined} />,
          <Ago key="a" at={x.lastActive} />,
        ])}
      />
      <Pager page={page} hasMore={w.next !== null} pages={w.pages} href={(p) => withQuery("/admin/workspaces", current, { page: p > 1 ? String(p) : undefined })} />
    </>
  );
}
