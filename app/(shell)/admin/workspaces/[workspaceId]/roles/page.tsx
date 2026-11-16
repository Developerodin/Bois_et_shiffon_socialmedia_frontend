import { PERMISSIONS, type AdminWorkspaceDetail } from "@espanda/shared";
import { Empty, Pill, Section, Table } from "@/components/admin/ui";
import { api, serverFetch } from "@/lib/server-fetch";

export const metadata = { title: "Roles · Workspace · Platform admin" };

const DESCRIPTION = new Map<string, string>(PERMISSIONS.map(([key, , description]) => [key, description]));

export default async function AdminWorkspaceRoles({ params }: { params: Promise<{ workspaceId: string }> }) {
  const d = await serverFetch<AdminWorkspaceDetail>(api`/api/v1/admin/workspaces/${(await params).workspaceId}`);

  return (
    <Section id="roles" title="Roles" description="Built-in and custom roles, how many people hold each, and what it allows. Hover a permission for its meaning.">
      <Table
        head={["Role", "Applies to", "People", "Permissions"]}
        numeric={[2]}
        empty="No roles."
        rows={d.roles.map((r) => [
          <div key="n" className="min-w-44">
            <p className="flex items-center gap-2 font-medium">
              {r.name} {r.isSystem ? <Pill>built in</Pill> : <Pill tone="warn">custom</Pill>}
            </p>
            {r.description ? <p className="mt-0.5 text-xs text-muted-foreground">{r.description}</p> : null}
          </div>,
          <span key="a" className="whitespace-nowrap">{r.scope === "WORKSPACE" ? "Workspace" : "One project"}</span>,
          r.holders ? r.holders.toLocaleString("en") : <Empty key="h" />,
          r.permissions.length ? (
            <div key="p" className="flex max-w-xl flex-wrap gap-1">
              {r.permissions.map((p) => (
                <span key={p} title={DESCRIPTION.get(p) ?? p} className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
                  {p}
                </span>
              ))}
            </div>
          ) : (
            <Empty key="p" />
          ),
        ])}
      />
    </Section>
  );
}
