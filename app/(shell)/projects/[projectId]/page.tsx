import { FolderKanban } from "lucide-react";
import { featureAccess } from "@/components/shell/feature-access";
import { ProjectView } from "@/components/tasks/project-view";
import { navFor } from "@/lib/nav";
import { getShell } from "@/lib/server-fetch";

export const metadata = { title: navFor("/projects").title };

/** One project (flag `tasks`, tasks.read): facts, milestones, tasks and the linked campaign's posts. */
export default async function ProjectRoute({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const access = await featureAccess({
    feature: "tasks",
    path: "/projects",
    icon: FolderKanban,
    noBusiness: "Projects belong to a business. Create or pick one from the sidebar, then its projects show here.",
    noRead: "Your role cannot see this business's projects. Ask a workspace admin for access.",
    perm: "tasks.read",
  });
  if (access.gate) return access.gate;
  const shell = await getShell(); // cached: featureAccess read it already
  // Remount on brand switch: the project belongs to the old business and shows as not found for the new one.
  return <ProjectView key={access.brandId} workspaceId={access.workspaceId} brandId={access.brandId} projectId={projectId} perms={shell.brandPermissions} userId={shell.user.id} />;
}
