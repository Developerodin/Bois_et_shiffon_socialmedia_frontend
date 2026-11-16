import { Gauge } from "lucide-react";
import { AuditBoard } from "@/components/performance/audit-board";
import { EmptyState } from "@/components/ui/empty-state";
import { getShell } from "@/lib/server-fetch";

export default async function PerformancePage() {
  const shell = await getShell();
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Gauge}
          title="Pick a brand to see its performance."
          description="SEO and AI-visibility reports are per brand. Choose one from the switcher above."
        />
      </div>
    );
  }

  return <AuditBoard key={shell.activeBrandId} workspaceId={shell.activeWorkspaceId} brandId={shell.activeBrandId} />;
}
