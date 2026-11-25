import { Mail } from "lucide-react";
import { DigestView } from "@/components/digest/digest-view";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { requireFeature } from "@/lib/features";
import { navFor } from "@/lib/nav";
import { api, getShell, serverFetch } from "@/lib/server-fetch";
import type { DigestsDto } from "@/shared";

export const metadata = { title: navFor("/digest").title };

/** The reader's weekly digests in this workspace (flag `digest`): each Monday, what their permissions show. */
export default async function DigestPage() {
  const shell = await getShell();
  requireFeature("digest", shell.activeWorkspaceId);
  if (!shell.activeWorkspaceId) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState size="hero" icon={Mail} headingLevel="h1" title="Weekly digest" description="Digests belong to a workspace. Pick one from the menu, then its digests show here." />
      </div>
    );
  }
  const { digests, email } = await serverFetch<DigestsDto>(api`/api/v1/workspaces/${shell.activeWorkspaceId}/digests`);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader title="Weekly digest">
        Every Monday, last week for each business you work on. {email ? "It is also emailed to you." : "Turn on the email from your account menu."}
      </PageHeader>
      <DigestView digests={digests} />
    </div>
  );
}
