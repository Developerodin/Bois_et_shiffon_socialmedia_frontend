import type { AdminWorkspaceHeader } from "@espanda/shared";
import { TabLinks } from "@/components/admin/tab-links";
import { day, PageHeader } from "@/components/admin/ui";
import { api, serverFetch } from "@/lib/server-fetch";

/**
 * One workspace's pages share this header and tab row. Entering the workspace is recorded in its audit log once
 * per visit (moving between its tabs keeps this layout, so it doesn't record again).
 */
export default async function AdminWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const { workspaceId } = await params;
  // The header and the audit entry in one go; a missing workspace is a 404 from both.
  const [ws] = await Promise.all([
    serverFetch<AdminWorkspaceHeader>(api`/api/v1/admin/workspaces/${workspaceId}/header`),
    serverFetch(api`/api/v1/admin/workspaces/${workspaceId}/visit`, { method: "POST" }),
  ]);
  const base = `/admin/workspaces/${workspaceId}`;

  return (
    <>
      <PageHeader title={ws.name} crumbs={[{ href: "/admin/workspaces", label: "Workspaces" }, { label: ws.name }]}>
        {ws.owner?.email ?? "No owner"} · since {day(ws.createdAt)} · read-only; this visit is recorded in the workspace’s audit log.
      </PageHeader>
      <div className="-mt-4 flex flex-col gap-8">
        <TabLinks
          label="Workspace"
          tabs={[
            { href: base, label: "Overview" },
            { href: `${base}/people`, label: "People", count: ws._count.members },
            { href: `${base}/projects`, label: "Projects", count: ws._count.brands },
            { href: `${base}/roles`, label: "Roles", count: ws._count.roles },
            { href: `${base}/spend`, label: "Spend & usage" },
            { href: `${base}/logs`, label: "Logs" },
          ]}
        />
        {children}
      </div>
    </>
  );
}
