import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { MainArea } from "@/components/workspace/main-area";
import { TopBar, type TopBarScores } from "@/components/workspace/top-bar";
import { effectivePermissions } from "@/server/auth/permissions";
import { isPlatformAdmin } from "@/server/auth/platform-admin";
import { prisma } from "@/server/db/prisma";
import { latestAuditReports } from "@/server/services/audit-reports";
import { loadShellContext } from "@/server/shell/load-shell-context";

/** Top-bar health scores: latest SEO report's PageSpeed + GEO score, for people allowed to see analytics. */
async function loadScores(workspaceId: string, brandId: string, userId: string): Promise<TopBarScores> {
  if (!(await effectivePermissions(workspaceId, userId, brandId)).has("analytics.read")) return null;
  const { seo, geo } = await latestAuditReports(workspaceId, brandId);
  if (!seo && !geo) return null;
  const ps = (seo?.metrics as { pageSpeed?: Record<string, number> } | null)?.pageSpeed ?? null;
  return {
    performance: ps?.performance ?? null,
    accessibility: ps?.accessibility ?? null,
    bestPractices: ps?.bestPractices ?? null,
    seo: ps?.seo ?? null,
    ai: geo?.score ?? null,
  };
}

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const shell = await loadShellContext(session.user.id);
  const canCreateBrand = shell.activeWorkspaceId
    ? (await effectivePermissions(shell.activeWorkspaceId, session.user.id)).has("brand.create")
    : false;
  const [scores, googleConnected] =
    shell.activeWorkspaceId && shell.activeBrandId
      ? await Promise.all([
          loadScores(shell.activeWorkspaceId, shell.activeBrandId, session.user.id),
          prisma.integrationConnection
            .count({ where: { brandId: shell.activeBrandId, provider: "GOOGLE", status: "ACTIVE" } })
            .then((n) => n > 0),
        ])
      : [null, false];

  return (
    <div className="flex h-dvh flex-col bg-background text-foreground">
      <TopBar
        userName={session.user.name}
        userEmail={session.user.email}
        userImage={session.user.image}
        workspaces={shell.workspaces}
        brands={shell.brands}
        activeWorkspaceId={shell.activeWorkspaceId}
        activeBrandId={shell.activeBrandId}
        scores={scores}
        googleConnected={googleConnected}
        canCreateBrand={canCreateBrand}
        platformAdmin={await isPlatformAdmin(session.user.id)}
      />
      <MainArea>{children}</MainArea>
    </div>
  );
}
