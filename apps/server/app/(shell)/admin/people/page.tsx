import Link from "next/link";
import type { AdminPeople } from "@espanda/shared";
import { Ago, day, Empty, PageHeader, Pager, Pill, SearchBox, Table, withQuery } from "@/components/admin/ui";
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
                    <Pill>{w.name}</Pill>
                  </Link>
                ))
              : <Empty />}
          </div>,
          u.projectRoles ? u.projectRoles.toLocaleString("en") : <Empty key="r" />,
          <div key="s" className="flex flex-wrap gap-1">
            <Pill tone={u.status === "ACTIVE" ? "good" : "bad"}>{u.status.toLowerCase()}</Pill>
            {u.isPlatformAdmin ? <Pill tone="warn">platform admin</Pill> : null}
          </div>,
          <Ago key="l" at={u.lastSignIn} />,
          <span key="j" className="whitespace-nowrap">{day(u.createdAt)}</span>,
        ])}
      />
      <Pager page={page} hasMore={p.next !== null} pages={p.pages} href={(n) => withQuery("/admin/people", current, { page: n > 1 ? String(n) : undefined })} />
    </>
  );
}
