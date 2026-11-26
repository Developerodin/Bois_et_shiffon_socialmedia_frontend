import { CalendarDays, Lock } from "lucide-react";
import { CalendarBoard } from "@/components/workspace/calendar-board";
import { EmptyState } from "@/components/ui/empty-state";
import { featureOn } from "@/lib/features";
import { getShell } from "@/lib/server-fetch";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/calendar").title };

/** The business's content calendar (Wave's slot); it was a panel on the Overview. */
export default async function CalendarPage() {
  const shell = await getShell();
  if (!shell.activeWorkspaceId || !shell.activeBrandId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={CalendarDays}
          headingLevel="h1"
          title="Content calendar"
          description="Posts belong to a business. Create or pick one from the sidebar, then its calendar shows here."
        />
      </div>
    );
  }

  // The posts list needs brand.read, as its route does; creating, approving and exporting need their own permissions,
  // which the calendar and the post view check.
  if (!shell.brandPermissions.includes("brand.read")) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState
          size="hero"
          icon={Lock}
          headingLevel="h1"
          title="Content calendar"
          description="Your role cannot see this business's posts. Ask a workspace admin for access."
        />
      </div>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      {/* No visible header: the calendar's own toolbar starts the page (owner). The breadcrumb names it; screen readers still get a heading. */}
      <h1 className="sr-only">Content calendar</h1>
      {/* Remount on brand switch so the calendar, its filters' options and the peek reset cleanly. */}
      <CalendarBoard key={shell.activeBrandId} workspaceId={shell.activeWorkspaceId} brandId={shell.activeBrandId} perms={shell.brandPermissions} userId={shell.user.id} reelsOn={featureOn("reels", shell.activeWorkspaceId)} />
    </div>
  );
}
