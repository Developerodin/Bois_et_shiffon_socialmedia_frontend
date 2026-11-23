import type { ReactElement } from "react";
import { Lock, type LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { requireFeature, type WebFeature } from "@/lib/features";
import { getShell } from "@/lib/server-fetch";
import { navFor } from "@/lib/nav";

export type Access = { gate: ReactElement } | { gate: null; workspaceId: string; brandId: string; perms: Set<string> };

/**
 * A flagged feature page's shared checks (server): the flag, a business picked, and brand.read (and `perm`). Returns the page to
 * show instead when one fails, else the business and the role's permissions.
 */
export async function featureAccess(p: {
  feature: WebFeature;
  /** The page's nav path; its label is the gate's heading. */
  path: string;
  /** Shown when no business is picked. */
  icon: LucideIcon;
  noBusiness: string;
  noRead: string;
  /** A permission the page needs besides brand.read; lacking it shows `noRead` too. */
  perm?: string;
}): Promise<Access> {
  const shell = await getShell();
  requireFeature(p.feature, shell.activeWorkspaceId);
  const title = navFor(p.path).title;
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return {
      gate: (
        <div className="mx-auto max-w-5xl">
          <EmptyState size="hero" icon={p.icon} headingLevel="h1" title={title} description={p.noBusiness} />
        </div>
      ),
    };
  }

  const perms = new Set(shell.brandPermissions);
  if (!perms.has("brand.read") || (p.perm && !perms.has(p.perm))) {
    return {
      gate: (
        <div className="mx-auto max-w-5xl">
          <EmptyState size="hero" icon={Lock} headingLevel="h1" title={title} description={p.noRead} />
        </div>
      ),
    };
  }
  return { gate: null, workspaceId: shell.activeWorkspaceId, brandId: shell.activeBrandId, perms };
}
