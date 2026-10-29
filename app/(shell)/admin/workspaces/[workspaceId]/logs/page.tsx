import { LogsView } from "@/components/admin/logs-view";
import { requirePlatformAdminPage } from "@/server/auth/platform-admin";

export const metadata = { title: "Logs · Workspace · Platform admin" };

export default async function AdminWorkspaceLogs({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ log?: string; status?: string; page?: string }> }) {
  await requirePlatformAdminPage();
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  return <LogsView path={`/admin/workspaces/${workspaceId}/logs`} query={query} workspaceId={workspaceId} />;
}
