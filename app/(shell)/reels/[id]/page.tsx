import { Clapperboard } from "lucide-react";
import { ReelNotFound, ReelPage } from "@/components/reels/reel-page";
import { isReelId } from "@/components/reels/reel";
import { featureAccess } from "@/components/shell/feature-access";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/reels").title };

/** One reel of the active business: its steps (Plan, Storyboard), the step open, and a preview. */
export default async function OneReelPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ step?: string | string[] }> }) {
  const access = await featureAccess({
    feature: "reels",
    path: "/reels",
    icon: Clapperboard,
    noBusiness: "Reels belong to a business. Create or pick one from the sidebar, then its reels show here.",
    noRead: "Your role cannot see this business's reels. Ask a workspace admin for access.",
  });
  if (access.gate) return access.gate;
  const { workspaceId, brandId, perms } = access;

  const [{ id }, q] = await Promise.all([params, searchParams]);
  // Not a reel id: no reel to ask the server for.
  if (!isReelId(id)) return <ReelNotFound />;

  return (
    <ReelPage
      // Remount on brand switch: the reel belongs to one brand, and the next brand answers 404 for it.
      key={brandId}
      workspaceId={workspaceId}
      brandId={brandId}
      reelId={id}
      step={typeof q.step === "string" ? q.step : undefined}
      canCreate={perms.has("content.create")}
    />
  );
}
