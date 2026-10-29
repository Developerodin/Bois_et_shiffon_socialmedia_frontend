import { notFound } from "next/navigation";
import { after } from "next/server";
import { TabLinks } from "@/components/admin/tab-links";
import { day, PageHeader } from "@/components/admin/ui";
import { requirePlatformAdminPage } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db/prisma";
import { recordWorkspaceView } from "@/server/services/platform-admin";

/**
 * One workspace's pages share this header and tab row. Entering the workspace is recorded in its audit log once
 * per visit (moving between its tabs keeps this layout, so it doesn't record again).
 */
export default async function AdminWorkspaceLayout({ children, params }: { children: React.ReactNode; params: Promise<{ workspaceId: string }> }) {
  const [viewer, { workspaceId }] = await Promise.all([requirePlatformAdminPage(), params]);
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    select: { name: true, createdAt: true, owner: { select: { email: true } }, _count: { select: { members: true, brands: true, roles: true } } },
  });
  if (!ws) notFound();
  after(() => recordWorkspaceView(workspaceId, viewer)); // written after the page is sent: the visit never waits on it
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
