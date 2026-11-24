import { DigestView } from "@/components/digest/digest-view";
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
  if (!shell.activeWorkspaceId) return <p className="p-10 text-muted-foreground">Pick a workspace from the menu.</p>;
  const { digests, email } = await serverFetch<DigestsDto>(api`/api/v1/workspaces/${shell.activeWorkspaceId}/digests`);
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8">
      <PageHeader title="Weekly digest">
        Every Monday, last week for each business you work on. {email ? "It is also emailed to you." : "Turn on the email from your account menu."}
      </PageHeader>
      <DigestView digests={digests} />
    </div>
  );
}
