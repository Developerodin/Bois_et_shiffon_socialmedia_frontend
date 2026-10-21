import { redirect } from "next/navigation";
import { Gauge } from "lucide-react";
import { auth } from "@/auth";
import { AuditBoard } from "@/components/performance/audit-board";
import { EmptyState } from "@/components/ui/empty-state";
import { loadShellContext } from "@/server/shell/load-shell-context";

export default async function PerformancePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const shell = await loadShellContext(session.user.id);
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
