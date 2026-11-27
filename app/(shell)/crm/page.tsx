import { Handshake } from "lucide-react";
import { CrmTabs } from "@/components/crm/crm-tabs";
import { featureAccess } from "@/components/shell/feature-access";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/crm").title };

/**
 * Sales & CRM (flag `crm`), opened from Spark's slot with either CRM key (plan 2026-11-27-crm, Decision 17); the tabs
 * then follow the keys (crmTabs).
 */
export default async function CrmRoute() {
  const access = await featureAccess({
    feature: "crm",
    path: "/crm",
    icon: Handshake,
    noBusiness: "Customers and quotes belong to a business. Create or pick one from the sidebar, then they show here.",
    noRead: "Your role can't see this business's customers or quotes. Ask a workspace admin for the customer records permission.",
    perm: ["crm.manage", "inbox.read"],
  });
  if (access.gate) return access.gate;
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <CrmTabs key={access.brandId} w={access.workspaceId} b={access.brandId} perms={[...access.perms]} />
    </div>
  );
}
