import { Images, Lock } from "lucide-react";
import { LibraryBoard } from "@/components/library/library-board";
import { EmptyState } from "@/components/ui/empty-state";
import { requireFeature } from "@/lib/features";
import { getShell } from "@/lib/server-fetch";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/library").title };

/** The brand's look and its photo library: the website's product photos and the owner's uploads. */
export default async function LibraryPage() {
  const shell = await getShell();
  requireFeature("library", shell.activeWorkspaceId);
  const title = navFor("/library").title;
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Images}
          headingLevel="h1"
          title={title}
          description="Photos belong to a business. Create or pick one from the sidebar, then its photos show here."
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
          title={title}
          description="Your role cannot see this business's photos. Ask a workspace admin for access."
        />
      </div>
    );
  }

  return (
    <LibraryBoard
      // Remount on brand switch so the chosen tab, status and uploads reset cleanly.
      key={shell.activeBrandId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId}
      canEdit={perms.has("context.edit")}
      canUpload={perms.has("publish.execute")}
    />
  );
}
