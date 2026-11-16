import { Lock, Plug } from "lucide-react";
import { ConnectionsTab } from "@/components/settings/connections-tab";
import { EmptyState } from "@/components/ui/empty-state";
import { getShell } from "@/lib/server-fetch";

/** The business's connected accounts. Settings keeps its own Connections tab; the OAuth callback still lands there. */
export default async function ConnectionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const shell = await getShell();
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    const canCreateBrand = shell.workspacePermissions.includes("brand.create");
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Plug}
          headingLevel="h1"
          title="Connections"
          description={
            canCreateBrand
              ? "Connections belong to a business. Create or pick one from the sidebar, then connect its accounts here."
              : "Connections belong to a business. Ask a workspace admin to add a business."
          }
        />
      </div>
    );
  }

  const perms = new Set(shell.brandPermissions);
  if (!perms.has("brand.read")) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Lock}
          headingLevel="h1"
          title="Connections"
          description="Your role cannot see this business's connections. Ask a workspace admin for access."
        />
      </div>
    );
  }

  const q = await searchParams;
  const notice = q.connected
    ? { kind: "ok" as const, text: `Connected ${q.connected}.`, names: q.connected.split(", ") }
    : q.connectError
      ? { kind: "error" as const, text: q.connectError }
      : null;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <div>
        <h1 className="font-display text-2xl leading-[30px] font-semibold tracking-tight">Connections</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          The accounts this business has connected, and what each one lets the agents do.
        </p>
      </div>
      <ConnectionsTab
        key={shell.activeBrandId}
        workspaceId={shell.activeWorkspaceId}
        brandId={shell.activeBrandId}
        canManage={perms.has("integrations.manage")}
        notice={notice}
      />
    </div>
  );
}
