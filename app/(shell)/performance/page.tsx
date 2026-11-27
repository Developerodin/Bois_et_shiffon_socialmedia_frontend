import { Gauge } from "lucide-react";
import { AuditBoard } from "@/components/performance/audit-board";
import { PerformanceTabs, type PerformanceTab } from "@/components/performance/performance-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { featureOn } from "@/lib/features";
import { getShell } from "@/lib/server-fetch";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/performance").title };

export default async function PerformancePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const shell = await getShell();
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          headingLevel="h1"
          icon={Gauge}
          title="Pick a brand to see its performance."
          description="SEO and AI-visibility reports are per brand. Choose one from the switcher above."
        />
      </div>
    );
  }

  const w = shell.activeWorkspaceId;
  const b = shell.activeBrandId;
  const can = (key: string) => shell.brandPermissions.includes(key);
  const reports = (bare: boolean) => (
    <AuditBoard
      key={b}
      workspaceId={w}
      brandId={b}
      canReadAgents={can("agents.read")}
      canMakeTasks={featureOn("tasks", w) && can("tasks.manage")}
      canSeeHistory={featureOn("data", w) && can("analytics.read")}
      canWriteBriefs={featureOn("tasks", w) && can("tasks.manage") && can("analytics.read")}
      canWriteArticles={featureOn("blog", w) && can("content.create")}
      bare={bare}
    />
  );
  // Each data tab needs its flag and its read permission (the server checks the permission again on every route).
  const tabs: PerformanceTab[] = ["reports"];
  if (featureOn("data", w) && can("analytics.read")) tabs.push("search", "posts");
  if (featureOn("sales", w) && can("crm.read")) tabs.push("sales");
  if (featureOn("ads", w) && can("ads.read")) tabs.push("ads");
  if (tabs.length === 1) return reports(false);

  const q = await searchParams;
  return (
    <PerformanceTabs
      key={b}
      workspaceId={w}
      brandId={b}
      brandName={shell.brands.find((x) => x.id === b)?.displayName ?? null}
      tabs={tabs}
      initialRange={{ from: q.from, to: q.to }}
      canManage={can("integrations.manage")}
      canSetBudgets={can("commercial.manage")}
      canMakeTasks={featureOn("tasks", w) && can("tasks.manage")}
      canWriteArticles={featureOn("blog", w) && can("content.create")}
      reports={reports(true)}
    />
  );
}
