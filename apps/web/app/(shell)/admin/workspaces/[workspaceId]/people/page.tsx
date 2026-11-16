import Link from "next/link";
import type { AdminWorkspaceDetail } from "@espanda/shared";
import { AccessMatrix } from "@/components/admin/access";
import { day, Empty, Pill, Section, Table, when } from "@/components/admin/ui";
import { api, serverFetch } from "@/lib/server-fetch";

export const metadata = { title: "People · Workspace · Platform admin" };

export default async function AdminWorkspacePeople({ params }: { params: Promise<{ workspaceId: string }> }) {
  const d = await serverFetch<AdminWorkspaceDetail>(api`/api/v1/admin/workspaces/${(await params).workspaceId}`);

  return (
    <>
      <Section id="members" title="Members" description="Each person’s workspace role and their project roles. Open a name for everything they belong to across the platform.">
        <Table
          head={["Person", "Workspace role", "Project roles", "Account", "Joined"]}
          empty="No members."
          rows={d.members.map((m) => [
            <div key="p" className="min-w-0">
              <Link href={`/admin/people/${m.user.id}`} className="font-medium underline-offset-4 hover:underline">
                {m.user.name ?? m.user.email}
              </Link>
              {m.user.name ? <p className="truncate text-xs text-muted-foreground">{m.user.email}</p> : null}
            </div>,
            m.role?.name ?? <Pill tone="bad">no role</Pill>,
            <div key="r" className="flex flex-wrap gap-1">
              {m.projects.some((p) => p.projectRole) ? m.projects.filter((p) => p.projectRole).map((p) => <Pill key={p.brandId}>{`${p.brand}: ${p.projectRole}`}</Pill>) : <Empty />}
            </div>,
            <Pill key="s" tone={m.user.status === "ACTIVE" ? "good" : "bad"}>
              {m.user.status.toLowerCase()}
            </Pill>,
            <span key="j" className="whitespace-nowrap" title={when(m.joinedAt)}>
              {day(m.joinedAt)}
            </span>,
          ])}
        />
      </Section>

      <Section id="access" title="What each person can do" description="Every permission, on the workspace and on each project, with the role that grants it. Matches what the app enforces (npm run check:platform-admin -w web).">
        <div className="flex flex-col gap-2">
          {d.members.map((m) => (
            <details key={m.user.id} className="group rounded-xl border border-border bg-card">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span>
                  <span className="font-medium">{m.user.name ?? m.user.email}</span>
                  <span className="text-muted-foreground">
                    {" "}
                    · {m.role?.name ?? "no role"} · {m.workspacePermissions.length} workspace permissions
                  </span>
                </span>
                <span className="text-xs text-muted-foreground group-open:hidden">Show</span>
                <span className="hidden text-xs text-muted-foreground group-open:inline">Hide</span>
              </summary>
              <div className="border-t border-border">
                <AccessMatrix columns={[{ key: "ws", label: "Workspace", grants: m.workspacePermissions }, ...m.projects.map((p) => ({ key: p.brandId, label: p.brand, grants: p.effective }))]} />
              </div>
            </details>
          ))}
        </div>
      </Section>

      <Section id="invitations" title="Pending invitations">
        <Table head={["Invited", "Role", "Project", "Expires"]} empty="No invitations pending." rows={d.invitations.map((i) => [i.email, i.role, i.project ?? "Whole workspace", day(i.expiresAt)])} />
      </Section>
    </>
  );
}
