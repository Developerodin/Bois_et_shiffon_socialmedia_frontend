import { Library } from "lucide-react";
import { ContextBoard } from "@/components/context/context-board";
import { NewBrandDialog } from "@/components/shell/new-brand-dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getShell } from "@/lib/server-fetch";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/context").title };

export default async function ContextPage() {
  const shell = await getShell();

  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <EmptyState
          headingLevel="h1"
          size="hero"
          icon={Library}
          eyebrow="Brand context"
          title="No brand yet. Add one and the agents get to work."
          description="Give us a name and a website. The Research agent drafts five strategy documents; you review them, and agents work from the latest version."
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

  if (!shell.brandPermissions.includes("agents.read")) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <EmptyState
          headingLevel="h1"
          size="hero"
          icon={Library}
          eyebrow="Brand context"
          title="Your role doesn't include the business context."
          description="Ask someone who manages this brand if you need it."
        />
      </div>
    );
  }

  return (
    <ContextBoard
      // Remount on brand switch so polling and selection reset cleanly.
      key={shell.activeBrandId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId}
      perms={shell.brandPermissions}
    />
  );
}
