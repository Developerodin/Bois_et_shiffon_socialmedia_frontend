import { LogsView } from "@/components/admin/logs-view";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Logs · Platform admin" };

export default async function AdminLogs({ searchParams }: { searchParams: Promise<{ log?: string; status?: string; tests?: string; days?: string; before?: string; ws?: string; who?: string }> }) {
  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Logs">
        Every workspace’s logs in one place. Open a workspace for its own.
      </PageHeader>
      <LogsView path="/admin/logs" query={await searchParams} />
    </>
  );
}
