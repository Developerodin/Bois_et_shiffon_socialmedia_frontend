import { Handshake } from "lucide-react";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/crm/quotes/print-button";
import { QuoteSheet } from "@/components/crm/quotes/quote-sheet";
import { featureAccess } from "@/components/shell/feature-access";
import { navFor } from "@/lib/nav";
import { api, getShell, serverFetch } from "@/lib/server-fetch";
import type { QuoteDto } from "@/shared";

export const metadata = { title: navFor("/crm").title };

/** A quote to print (data-print-root: the shell and the button stay off the paper, globals.css). */
export default async function QuotePrintRoute({ params }: { params: Promise<{ id: string }> }) {
  const access = await featureAccess({
    feature: "crm",
    path: "/crm",
    icon: Handshake,
    noBusiness: "Pick the quote's business from the sidebar first.",
    noRead: "Your role can't see this business's quotes.",
    perm: "crm.manage",
  });
  if (access.gate) return access.gate;
  const { id } = await params;
  if (id.length > 40) notFound();
  const shell = await getShell();
  const brand = shell.brands.find((x) => x.id === access.brandId)?.displayName;
  const { quote } = await serverFetch<{ quote: QuoteDto }>(api`/api/v1/workspaces/${access.workspaceId}/brands/${access.brandId}/quotes/${id}`);
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6" data-print-root>
      <PrintButton />
      <QuoteSheet quote={quote} brand={brand} headingLevel="h1" />
    </div>
  );
}
