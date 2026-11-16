import { Library } from "lucide-react";
import { ContextBoard } from "@/components/context/context-board";
import { NewBrandDialog } from "@/components/shell/new-brand-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getShell } from "@/lib/server-fetch";

export default async function ContextPage() {
  const shell = await getShell();

  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <EmptyState
          size="hero"
          icon={Library}
          eyebrow="Brand context"
          title="No brand yet. Add one and the agents get to work."
          description="Give us a name and a website. The Research agent drafts five strategy documents; you confirm them, and every agent works from what you confirmed."
        />
        {shell.activeWorkspaceId ? (
          <div>
            <NewBrandDialog
              workspaceId={shell.activeWorkspaceId}
              trigger={<Button size="lg">Create a brand</Button>}
            />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <ContextBoard
      // Remount on brand switch so polling and selection reset cleanly.
      key={shell.activeBrandId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId}
    />
  );
}
