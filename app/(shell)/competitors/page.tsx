import { Lock, Users } from "lucide-react";
import { CompetitorsBoard } from "@/components/workspace/competitors-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { getShell } from "@/lib/server-fetch";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/competitors").title };

/** The business's tracked competitors and their audits (Drift's slot); it was a panel on the Overview. */
export default async function CompetitorsPage() {
  const shell = await getShell();
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Users}
          headingLevel="h1"
          title="Competitors"
          description="Competitors belong to a business. Create or pick one from the sidebar, then the ones it tracks show here."
        />
      </div>
    );
  }

  // The list needs brand.read and adding, auditing or removing needs agents.run: the routes check the same.
  const perms = new Set(shell.brandPermissions);
  if (!perms.has("brand.read")) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Lock}
          headingLevel="h1"
          title="Competitors"
          description="Your role cannot see this business's competitors. Ask a workspace admin for access."
        />
      </div>
    );
  }

  const base = `/api/v1/workspaces/${encodeURIComponent(shell.activeWorkspaceId)}/brands/${encodeURIComponent(shell.activeBrandId)}`;
  return (
    <div className="flex w-full flex-col gap-5">
      <PageHeader title="Competitors">Brands you track, with their site audits.</PageHeader>
      {/* Remount on brand switch so the list and the add form reset cleanly. */}
      <CompetitorsBoard key={shell.activeBrandId} base={base} canRun={perms.has("agents.run")} />
    </div>
  );
}
