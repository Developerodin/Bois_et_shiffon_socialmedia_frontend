import { Camera, Lock } from "lucide-react";
import { Studio } from "@/components/photoshoot/studio";
import { isShootId } from "@/components/photoshoot/shoot";
import { EmptyState } from "@/components/ui/empty-state";
import { requireFeature } from "@/lib/features";
import { getShell } from "@/lib/server-fetch";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/photoshoot").title };

/** The photoshoot studio: set up a product or fashion shoot, follow the one just started, and browse past shoots. */
export default async function PhotoshootPage({ searchParams }: { searchParams: Promise<{ shoot?: string | string[]; b?: string | string[] }> }) {
  const shell = await getShell();
  requireFeature("photoshoot", shell.activeWorkspaceId);
  const title = navFor("/photoshoot").title;
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Camera}
          headingLevel="h1"
          title={title}
          description="Photoshoots belong to a business. Create or pick one from the sidebar, then its photoshoots show here."
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
          description="Your role cannot see this business's photoshoots. Ask a workspace admin for access."
        />
      </div>
    );
  }

  // ?shoot= only counts for the brand it was made in: after a brand switch the old id would be another brand's.
  const q = await searchParams;
  const initialShootId = isShootId(q.shoot) && q.b === shell.activeBrandId ? q.shoot : null;

  return (
    <Studio
      // Remount on brand switch so the setups, the current shoot and the filter reset cleanly.
      key={shell.activeBrandId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId}
      canCreate={perms.has("content.create")}
      canUpload={perms.has("content.create")}
      initialShootId={initialShootId}
    />
  );
}
