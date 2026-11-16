import { Lock, Package } from "lucide-react";
import { ProductsBoard } from "@/components/products/products-board";
import { EmptyState } from "@/components/ui/empty-state";
import { getShell } from "@/lib/server-fetch";

/** The business's product catalogue: synced from Shopify or the website's feed, plus products added by hand. */
export default async function ProductsPage() {
  const shell = await getShell();
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Package}
          headingLevel="h1"
          title="Products"
          description="Products belong to a business. Create or pick one from the sidebar, then its catalogue shows here."
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
          title="Products"
          description="Your role cannot see this business's products. Ask a workspace admin for access."
        />
      </div>
    );
  }

  return (
    <ProductsBoard
      // Remount on brand switch so polling and dialogs reset cleanly.
      key={shell.activeBrandId}
      workspaceId={shell.activeWorkspaceId}
      brandId={shell.activeBrandId}
      canEdit={perms.has("context.edit")}
      canVouch={perms.has("rules.approve")}
      canManageCommercial={perms.has("commercial.manage")}
    />
  );
}
