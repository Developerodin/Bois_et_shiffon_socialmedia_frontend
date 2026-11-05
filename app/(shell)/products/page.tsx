import { redirect } from "next/navigation";
import { Lock, Package } from "lucide-react";
import { auth } from "@/auth";
import { ProductsBoard } from "@/components/products/products-board";
import { EmptyState } from "@/components/ui/empty-state";
import { effectivePermissions } from "@/server/auth/permissions";
import { loadShellContext } from "@/server/shell/load-shell-context";

/** The business's product catalogue: synced from Shopify or the website's feed, plus products added by hand. */
export default async function ProductsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const shell = await loadShellContext(session.user.id);
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

  const perms = await effectivePermissions(shell.activeWorkspaceId, session.user.id, shell.activeBrandId);
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
    />
  );
}
