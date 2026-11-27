import { Lock, Share2 } from "lucide-react";
import { AnalyticsView } from "@/components/social/analytics-view";
import { EmptyState } from "@/components/ui/empty-state";
import { getShell } from "@/lib/server-fetch";

export const metadata = { title: "Analytics" };

/** The Facebook Page and Instagram numbers, one tab each (?account=instagram|facebook); for roles that read analytics. */
export default async function SocialAnalyticsPage({ searchParams }: { searchParams: Promise<{ account?: string }> }) {
  const shell = await getShell();
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState size="hero" icon={Share2} headingLevel="h1" title="Analytics" description="Analytics belong to a business. Create or pick one from the sidebar." />
      </div>
    );
  }
  if (!shell.brandPermissions.includes("analytics.read")) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState size="hero" icon={Lock} headingLevel="h1" title="Analytics" description="Your role cannot see this business's analytics. Ask a workspace admin for access." />
      </div>
    );
  }
  const { account } = await searchParams;
  const base = `/api/v1/workspaces/${encodeURIComponent(shell.activeWorkspaceId)}/brands/${encodeURIComponent(shell.activeBrandId)}`;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <h1 className="sr-only">Analytics</h1>
      {/* key: a brand switch starts the page over. */}
      <AnalyticsView key={shell.activeBrandId} base={base} account={account === "facebook" ? "facebook" : "instagram"} />
    </div>
  );
}
