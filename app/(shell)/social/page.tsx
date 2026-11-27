import Link from "next/link";
import { Lock, Share2 } from "lucide-react";
import { SocialLanding } from "@/components/social/social-landing";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { featureOn } from "@/lib/features";
import { navFor } from "@/lib/nav";
import { getShell } from "@/lib/server-fetch";
import { CONNECTIONS_READ } from "@/shared";

export const metadata = { title: navFor("/social").title };

/** Social & Content (Wave's slot): the channels, each with its connection, next post and approvals; a channel opens its calendar. */
export default async function SocialPage() {
  const shell = await getShell();
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState size="hero" icon={Share2} headingLevel="h1" title="Social & Content" description="Channels belong to a business. Create or pick one from the sidebar, then its channels show here." />
      </div>
    );
  }
  // The summary needs brand.read, as the calendar does.
  if (!shell.brandPermissions.includes("brand.read")) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState size="hero" icon={Lock} headingLevel="h1" title="Social & Content" description="Your role cannot see this business's posts. Ask a workspace admin for access." />
      </div>
    );
  }
  // Connections are for people who answer customers, publish or manage the accounts (as on /connections): others see none.
  const canSeeConnections = CONNECTIONS_READ.some((k) => shell.brandPermissions.includes(k));
  // Connecting an account is for people who manage them, as on /connections.
  const canManageConnections = shell.brandPermissions.includes("integrations.manage");
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <PageHeader
        visible
        title="Channels"
        actions={
          <>
            {canManageConnections && (
              <Button asChild size="sm" variant="outline">
                <Link href="/connections">Connect channel</Link>
              </Button>
            )}
            <Button asChild size="sm">
              <Link href="/calendar">Open full calendar</Link>
            </Button>
          </>
        }
      >
        Manage your social publishing destinations.
      </PageHeader>
      {/* Remount on brand switch so the summary and the connections reset with the business. */}
      <SocialLanding key={shell.activeBrandId} workspaceId={shell.activeWorkspaceId} brandId={shell.activeBrandId} canSeeConnections={canSeeConnections} canManageConnections={canManageConnections} blogOn={featureOn("blog", shell.activeWorkspaceId)} />
    </div>
  );
}
