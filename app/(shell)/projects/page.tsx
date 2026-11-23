import { FolderKanban } from "lucide-react";
import { featureAccess } from "@/components/shell/feature-access";
import { ProjectsPage } from "@/components/tasks/project-list";
import { navFor } from "@/lib/nav";
import { getShell } from "@/lib/server-fetch";

export const metadata = { title: navFor("/projects").title };

/** Projects (flag `tasks`, tasks.read): the brand's projects with their progress. */
export default async function ProjectsRoute() {
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
  return <ProjectsPage key={access.brandId} workspaceId={access.workspaceId} brandId={access.brandId} perms={shell.brandPermissions} />;
}
