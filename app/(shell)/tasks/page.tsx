import { ListTodo, Lock } from "lucide-react";
import { featureAccess } from "@/components/shell/feature-access";
import { TasksPage } from "@/components/tasks/tasks-page";
import { EmptyState } from "@/components/ui/empty-state";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/tasks").title };

/** Projects & tasks (flag `tasks`, tasks.read): the brand's tasks by area and view, as a list or a board. */
export default async function TasksRoute() {
  const access = await featureAccess({
    feature: "tasks",
    path: "/tasks",
    icon: ListTodo,
    noBusiness: "Tasks belong to a business. Create or pick one from the sidebar, then its tasks show here.",
    noRead: "Your role cannot see this business's tasks. Ask a workspace admin for access.",
  });
  if (access.gate) return access.gate;
  if (!access.perms.has("tasks.read")) {
    return (
      <div className="mx-auto max-w-5xl">
        <EmptyState size="hero" icon={Lock} headingLevel="h1" title={navFor("/tasks").title} description="Your role cannot see this business's tasks. Ask a workspace admin for access." />
      </div>
    );
  }
  // Remount on brand switch so the lists start over for the new business.
  return <TasksPage key={access.brandId} workspaceId={access.workspaceId} brandId={access.brandId} />;
}
