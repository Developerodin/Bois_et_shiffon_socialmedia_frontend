import { redirect } from "next/navigation";
import { Bot } from "lucide-react";
import { auth } from "@/auth";
import { AgentsBoard } from "@/components/agents/agents-board";
import { EmptyState } from "@/components/ui/empty-state";
import { loadShellContext } from "@/server/shell/load-shell-context";

export default async function AgentsPage() {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/login");
  }

  const shell = await loadShellContext(session.user.id);

  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Bot}
          title="Pick a brand to meet its agents."
          description="Agents run per brand. Choose a brand from the switcher above to see their status and live log."
        />
      </div>
    );
  }

  return (
    <AgentsBoard
      // Remount on brand switch so polling cursors and state reset cleanly.
      key={shell.activeBrandId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId}
    />
  );
}
