import { Gauge } from "lucide-react";
import { featureAccess } from "@/components/shell/feature-access";
import { UrlHistory } from "@/components/performance/url-history";
import { featureOn } from "@/lib/features";

export const metadata = { title: "Page history" };

/** One URL's SEO story (flag `data`, analytics.read, as the Search tab). The server checks the URL is the brand's. */
export default async function UrlHistoryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const access = await featureAccess({
    feature: "data",
    path: "/performance",
    icon: Gauge,
    noBusiness: "Pick a brand to see a page's search history.",
    noRead: "Your role can't see search numbers. Ask a workspace admin for access.",
    perm: "analytics.read",
  });
  if (access.gate) return access.gate;
  const q = await searchParams;
  return (
    <UrlHistory
      key={`${access.brandId}:${q.u ?? ""}`}
      workspaceId={access.workspaceId}
      brandId={access.brandId}
      url={q.u ?? ""}
      canOpenTasks={featureOn("tasks", access.workspaceId) && access.perms.has("tasks.read")}
    />
  );
}
