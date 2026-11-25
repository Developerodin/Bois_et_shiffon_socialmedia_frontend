import { Handshake } from "lucide-react";
import { QuotesBoard } from "@/components/crm/quotes/quotes-board";
import { featureAccess } from "@/components/shell/feature-access";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/crm").title };

/** Sales & CRM (flag `crm`), opened from Spark's slot. Quotes for now (crm.manage); the stored inbox and customers come with tier 2. */
export default async function CrmRoute() {
  const access = await featureAccess({
    feature: "crm",
    path: "/crm",
    icon: Handshake,
    noBusiness: "Quotes belong to a business. Create or pick one from the sidebar, then its quotes show here.",
    noRead: "Your role can't see this business's quotes. Ask a workspace admin for the customer records permission.",
    perm: "crm.manage",
  });
  if (access.gate) return access.gate;
  // The board holds the page header: its New quote button needs the board's state.
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <QuotesBoard key={access.brandId} w={access.workspaceId} b={access.brandId} />
    </div>
  );
}
