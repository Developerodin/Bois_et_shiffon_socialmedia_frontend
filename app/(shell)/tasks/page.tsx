import { ListTodo } from "lucide-react";
import { featureAccess } from "@/components/shell/feature-access";
import { TasksPage } from "@/components/tasks/tasks-page";
import { featureOn } from "@/lib/features";
import { navFor } from "@/lib/nav";
import { getShell } from "@/lib/server-fetch";
import { CRM_TASK_KEYS } from "@/shared";

export const metadata = { title: navFor("/tasks").title };

/** Projects & tasks (flag `tasks`, tasks.read): the brand's tasks by area and view, as a list or a board. */
export default async function TasksRoute() {
  const access = await featureAccess({
    feature: "tasks",
    path: "/tasks",
    icon: ListTodo,
    noBusiness: "Tasks belong to a business. Create or pick one from the sidebar, then its tasks show here.",
    noRead: "Your role cannot see this business's tasks. Ask a workspace admin for access.",
    perm: "tasks.read",
  });
  if (access.gate) return access.gate;
  const shell = await getShell(); // cached: featureAccess read it already
  // The Sales & CRM tab: flag `crm` and a key that shows CRM tasks.
  const crm = featureOn("crm", access.workspaceId) && CRM_TASK_KEYS.some((k) => shell.brandPermissions.includes(k));
  // Remount on brand switch so the lists start over for the new business.
  return <TasksPage key={access.brandId} workspaceId={access.workspaceId} brandId={access.brandId} userId={shell.user.id} perms={shell.brandPermissions} crm={crm} />;
}
