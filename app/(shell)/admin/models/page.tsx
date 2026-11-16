import { PageHeader } from "@/components/admin/ui";
import { AiModelsTab } from "@/components/settings/ai-models-tab";

export const metadata = { title: "AI models · Platform admin" };

/** Platform-wide, so it lives here rather than in a workspace's Settings (a platform admin may have no workspace). */
export default function AdminModels() {
  return (
    <>
      <PageHeader eyebrow="Platform admin" title="AI models" />
      <AiModelsTab />
    </>
  );
}
