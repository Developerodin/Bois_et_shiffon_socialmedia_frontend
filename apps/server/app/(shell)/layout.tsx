import { Suspense } from "react";
import { PageViewTracker } from "@/components/page-view-tracker";
import { AssistantPanel } from "@/components/shell/assistant-panel";
import { AssistantProvider } from "@/components/shell/assistant-state";
import { Sidebar } from "@/components/shell/sidebar";
import { TopBar } from "@/components/shell/top-bar";
import { MainArea } from "@/components/workspace/main-area";
import { getShell } from "@/lib/server-fetch";

/** The Refined workspace frame: sidebar | top bar over the page | the Espanda panel. */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const shell = await getShell();
  const workspaceId = shell.activeWorkspaceId;
  const canCreateBrand = shell.workspacePermissions.includes("brand.create");
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
          platformAdmin={shell.isPlatformAdmin}
          user={{ ...shell.user, roleLabel: shell.roleLabel }}
        />
      </Suspense>
      <AssistantProvider>
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar brandName={brandName} workspaceId={workspaceId} brandId={shell.activeBrandId} />
          <MainArea>{children}</MainArea>
        </div>
        {/* A platform-only account has no workspace, so no conversation to hold. */}
        {workspaceId ? <AssistantPanel workspaceId={workspaceId} brandId={shell.activeBrandId} brandName={brandName} canCreateBrand={canCreateBrand} /> : null}
      </AssistantProvider>
      <PageViewTracker workspaceId={workspaceId} brandId={shell.activeBrandId} />
    </div>
  );
}
