import { ListTodo } from "lucide-react";
import { featureAccess } from "@/components/shell/feature-access";
import { TasksPage } from "@/components/tasks/tasks-page";
import { navFor } from "@/lib/nav";
import { getShell } from "@/lib/server-fetch";

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
  // Remount on brand switch so the lists start over for the new business.
  return <TasksPage key={access.brandId} workspaceId={access.workspaceId} brandId={access.brandId} userId={shell.user.id} canManage={access.perms.has("tasks.manage")} />;
}
