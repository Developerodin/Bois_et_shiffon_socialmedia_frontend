import { SpendView } from "@/components/admin/spend-view";
import { PageHeader } from "@/components/admin/ui";

export const metadata = { title: "Spend & usage · Platform admin" };

export default async function AdminSpend({ searchParams }: { searchParams: Promise<{ days?: string; tests?: string }> }) {
  return (
    <>
      <PageHeader eyebrow="Platform admin" title="Spend & usage">
        What the platform costs, at list price: AI calls and other paid APIs, by day, workspace, model, tier, task and API.
      </PageHeader>
      <SpendView path="/admin/spend" query={await searchParams} />
    </>
  );
}
