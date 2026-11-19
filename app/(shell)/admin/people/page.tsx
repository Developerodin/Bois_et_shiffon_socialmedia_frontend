import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import { ADMIN_PAGE_SIZE, type AdminPeople } from "@/shared";
import { Pagination } from "@/components/ui/pagination";
import { Ago, day, Empty, SearchBox, Table, withQuery } from "@/components/admin/ui";
import { PageHeader } from "@/components/ui/page-header";
import { serverFetch } from "@/lib/server-fetch";

export const metadata = { title: "People · Platform admin" };

export default async function AdminPeople({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const q = await searchParams;
  const p = await serverFetch<AdminPeople>(withQuery("/api/v1/admin/people", {}, q));
  const { page } = p;
  const current = { q: q.q, page: page > 1 ? String(page) : undefined };

  return (
    <>
      <PageHeader eyebrow="Platform admin" title="People">
        {p.total.toLocaleString("en")} {q.q ? `matching “${q.q}”` : "accounts"}, newest first. Open someone for every workspace and project they’re in, their roles and what those allow.
      </PageHeader>
      <SearchBox placeholder="Search by name or email" value={q.q} />
      {page > 1 && p.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <Link href={withQuery("/admin/people", current, { page: undefined })} className="underline underline-offset-4">Go to page 1</Link>
        </p>
      ) : null}
      <Table
        wide
        head={["Person", "Workspaces", "Project roles", "Account", "Last sign-in", "Joined"]}
        numeric={[2]}
        empty={page > 1 ? "No results on this page." : q.q ? "Nobody matches that search." : "No accounts yet."}
        rows={p.rows.map((u) => [
          <div key="p" className="min-w-0 max-w-xs">
            <Link href={`/admin/people/${u.id}`} className="font-medium underline-offset-4 hover:underline">
              {u.name ?? u.email}
            </Link>
            {u.name ? <p className="truncate text-xs text-muted-foreground">{u.email}</p> : null}
          </div>,
          <div key="w" className="flex max-w-sm flex-wrap gap-1">
            {u.workspaces.length
              ? u.workspaces.map((w) => (
                  <Link key={w.id} href={`/admin/workspaces/${w.id}/people`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <StatusBadge>{w.name}</StatusBadge>
                  </Link>
                ))
              : <Empty />}
          </div>,
          u.projectRoles ? u.projectRoles.toLocaleString("en") : <Empty key="r" />,
          <div key="s" className="flex flex-wrap gap-1">
            <StatusBadge tone={u.status === "ACTIVE" ? "good" : "bad"}>{u.status.toLowerCase()}</StatusBadge>
            {u.isPlatformAdmin ? <StatusBadge tone="warn">platform admin</StatusBadge> : null}
          </div>,
          <Ago key="l" at={u.lastSignIn} />,
          <span key="j" className="whitespace-nowrap">{day(u.createdAt)}</span>,
        ])}
      />
      <Pagination label="Pages of people" page={page} totalPages={p.pages} total={p.total} pageSize={ADMIN_PAGE_SIZE} shown={p.rows.length} link={withQuery("/admin/people", current, { page: undefined })} />
    </>
  );
}
