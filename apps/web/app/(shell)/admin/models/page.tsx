import { PageHeader } from "@/components/admin/ui";
import { AiModelsTab } from "@/components/settings/ai-models-tab";
// eslint-disable-next-line no-restricted-imports -- converted in task 4
import { requirePlatformAdminPage } from "@/server/auth/platform-admin";

export const metadata = { title: "AI models · Platform admin" };

/** Platform-wide, so it lives here rather than in a workspace's Settings (a platform admin may have no workspace). */
export default async function AdminModels() {
  await requirePlatformAdminPage();
  return (
    <>
      <PageHeader eyebrow="Platform admin" title="AI models" />
      <AiModelsTab />
    </>
  );
}
