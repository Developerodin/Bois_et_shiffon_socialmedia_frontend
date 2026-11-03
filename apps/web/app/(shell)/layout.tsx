import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { PageViewTracker } from "@/components/page-view-tracker";
import { AssistantPanel } from "@/components/shell/assistant-panel";
import { AssistantProvider } from "@/components/shell/assistant-state";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { MainArea } from "@/components/workspace/main-area";
import { effectivePermissions } from "@/server/auth/permissions";
import { isPlatformAdmin } from "@/server/auth/platform-admin";
import { loadRoleLabel } from "@/server/shell/load-role-label";
import { loadShellContext } from "@/server/shell/load-shell-context";

/** The Refined workspace frame: sidebar | top bar over the page | the Espanda panel. */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const userId = session.user.id;

  const shell = await loadShellContext(userId);
  const workspaceId = shell.activeWorkspaceId;
  const [canCreateBrand, roleLabel, platformAdmin] = await Promise.all([
    workspaceId ? effectivePermissions(workspaceId, userId).then((p) => p.has("brand.create")) : false,
    workspaceId ? loadRoleLabel(workspaceId, userId) : null,
    isPlatformAdmin(userId),
  ]);
  const brandName = shell.brands.find((b) => b.id === shell.activeBrandId)?.displayName ?? null;

  return (
    <div className="flex h-dvh bg-background text-foreground">
      {/* Suspense: the sidebar reads ?panel= (useSearchParams), which would otherwise stop pages prerendering. */}
      <Suspense fallback={<div className="h-full w-[232px] shrink-0 bg-card" />}>
        <Sidebar
          brands={shell.brands}
          workspaces={shell.workspaces}
          activeWorkspaceId={workspaceId}
          activeBrandId={shell.activeBrandId}
          canCreateBrand={canCreateBrand}
          platformAdmin={platformAdmin}
          user={{ name: session.user.name, email: session.user.email, image: session.user.image, roleLabel }}
        />
      </Suspense>
      <AssistantProvider>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar brandName={brandName} workspaceId={workspaceId} brandId={shell.activeBrandId} />
          <MainArea>{children}</MainArea>
        </div>
        {/* A platform-only account has no workspace, so no conversation to hold. */}
        {workspaceId ? <AssistantPanel workspaceId={workspaceId} brandId={shell.activeBrandId} brandName={brandName} /> : null}
      </AssistantProvider>
      <PageViewTracker workspaceId={workspaceId} brandId={shell.activeBrandId} />
    </div>
  );
}
