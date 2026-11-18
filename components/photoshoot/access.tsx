import type { ReactElement } from "react";
import { Camera, Lock } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { requireFeature } from "@/lib/features";
import { getShell } from "@/lib/server-fetch";
import { navFor } from "@/lib/nav";

/**
 * The photoshoot pages' shared checks (server): the flag, a business picked, and brand.read. Returns the page to show
 * instead when one fails, else the business and the role's permissions.
 */
export async function photoshootAccess(): Promise<
  { gate: ReactElement } | { gate: null; workspaceId: string; brandId: string; perms: Set<string> }
> {
  const shell = await getShell();
  requireFeature("photoshoot", shell.activeWorkspaceId);
  const title = navFor("/photoshoot").title;
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return {
      gate: (
        <div className="mx-auto max-w-5xl">
          <EmptyState
            size="hero"
            icon={Camera}
            headingLevel="h1"
            title={title}
            description="Photoshoots belong to a business. Create or pick one from the sidebar, then its photoshoots show here."
          />
        </div>
      ),
    };
  }

  const perms = new Set(shell.brandPermissions);
  if (!perms.has("brand.read")) {
    return {
      gate: (
        <div className="mx-auto max-w-5xl">
          <EmptyState
            size="hero"
            icon={Lock}
            headingLevel="h1"
            title={title}
            description="Your role cannot see this business's photoshoots. Ask a workspace admin for access."
          />
        </div>
      ),
    };
  }
  return { gate: null, workspaceId: shell.activeWorkspaceId, brandId: shell.activeBrandId, perms };
}
