import { SpendView } from "@/components/admin/spend-view";

export const metadata = { title: "Spend · Workspace · Platform admin" };

export default async function AdminWorkspaceSpend({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ days?: string }> }) {
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  return <SpendView path={`/admin/workspaces/${workspaceId}/spend`} query={query} workspaceId={workspaceId} />;
}
