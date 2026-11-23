import { Gauge } from "lucide-react";
import { AuditBoard } from "@/components/performance/audit-board";
import { EmptyState } from "@/components/ui/empty-state";
import { featureOn } from "@/lib/features";
import { getShell } from "@/lib/server-fetch";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/performance").title };

export default async function PerformancePage() {
  const shell = await getShell();
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          headingLevel="h1"
          icon={Gauge}
          title="Pick a brand to see its performance."
          description="SEO and AI-visibility reports are per brand. Choose one from the switcher above."
        />
      </div>
    );
  }

  return (
    <AuditBoard
      key={shell.activeBrandId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId}
      canReadAgents={shell.brandPermissions.includes("agents.read")}
      canMakeTasks={featureOn("tasks", shell.activeWorkspaceId) && shell.brandPermissions.includes("tasks.manage")}
    />
  );
}
