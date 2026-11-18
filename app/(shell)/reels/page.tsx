import { Clapperboard } from "lucide-react";
import { ReelsHome } from "@/components/reels/home";
import { featureAccess } from "@/components/shell/feature-access";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/reels").title };

/** The reels home: plan a new reel, the brand's presenters and templates, and its reels. */
export default async function ReelsPage() {
  const access = await featureAccess({
    feature: "reels",
    path: "/reels",
    icon: Clapperboard,
    noBusiness: "Reels belong to a business. Create or pick one from the sidebar, then its reels show here.",
    noRead: "Your role cannot see this business's reels. Ask a workspace admin for access.",
  });
  if (access.gate) return access.gate;
  const { workspaceId, brandId, perms } = access;

  return (
    // Remount on brand switch: a plan streaming for the old brand never opens its reel here.
    <ReelsHome key={brandId} workspaceId={workspaceId} brandId={brandId} canCreate={perms.has("content.create")} />
  );
}
