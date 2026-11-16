import { LogsView } from "@/components/admin/logs-view";

export const metadata = { title: "Logs · Workspace · Platform admin" };

export default async function AdminWorkspaceLogs({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ log?: string; status?: string; days?: string; before?: string }> }) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  return <LogsView path={`/admin/workspaces/${workspaceId}/logs`} query={query} workspaceId={workspaceId} />;
}
