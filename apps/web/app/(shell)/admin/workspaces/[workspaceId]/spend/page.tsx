import { SpendView } from "@/components/admin/spend-view";
// eslint-disable-next-line no-restricted-imports -- converted in task 4
import { requirePlatformAdminPage } from "@/server/auth/platform-admin";

export const metadata = { title: "Spend · Workspace · Platform admin" };

export default async function AdminWorkspaceSpend({ params, searchParams }: { params: Promise<{ workspaceId: string }>; searchParams: Promise<{ days?: string }> }) {
  await requirePlatformAdminPage();
  const [{ workspaceId }, query] = await Promise.all([params, searchParams]);
  return <SpendView path={`/admin/workspaces/${workspaceId}/spend`} query={query} workspaceId={workspaceId} />;
}
