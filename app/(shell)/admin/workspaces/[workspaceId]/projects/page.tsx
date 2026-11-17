import Link from "next/link";
import { StatusBadge } from "@/components/ui/status-badge";
import type { AdminWorkspaceDetail } from "@/shared";
import { day, Empty, Section, Table, when } from "@/components/admin/ui";
import { api, serverFetch } from "@/lib/server-fetch";

export const metadata = { title: "Projects · Workspace · Platform admin" };

export default async function AdminWorkspaceProjects({ params }: { params: Promise<{ workspaceId: string }> }) {
  const d = await serverFetch<AdminWorkspaceDetail>(api`/api/v1/admin/workspaces/${(await params).workspaceId}`);
  const wide = d.members.filter((m) => m.projects.some((p) => p.effective.some((e) => e.key === "brand.read") && !p.projectRole)).map((m) => m.user.name ?? m.user.email);

  return (
    <Section
      id="projects"
      title="Projects"
      description={`Brands in this workspace and the people given a role on each.${wide.length ? ` Reaching every project through their workspace role: ${wide.join(", ")}.` : ""}`}
    >
      <Table
        head={["Project", "Status", "People with a project role", "Created"]}
        empty="No projects."
        rows={d.brands.map((b) => [
          <span key="n" className="font-medium">{b.name}</span>,
          <StatusBadge key="s" status={b.status}>{b.status.toLowerCase()}</StatusBadge>,
          <div key="m" className="flex flex-wrap gap-1">
            {b.members.length
              ? b.members.map((m) => (
                  <Link key={m.userId} href={`/admin/people/${m.userId}`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    <StatusBadge>{`${m.name ?? m.email}: ${m.role}`}</StatusBadge>
                  </Link>
                ))
              : <Empty />}
          </div>,
          <span key="c" className="whitespace-nowrap" title={when(b.createdAt)}>
            {day(b.createdAt)}
          </span>,
        ])}
      />
    </Section>
  );
}
