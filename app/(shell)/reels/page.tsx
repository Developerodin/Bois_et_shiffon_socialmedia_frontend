import { reelsAccess } from "@/components/reels/access";
import { ReelsHome } from "@/components/reels/home";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/reels").title };

/** The reels home: plan a new reel, the brand's presenters and templates, and its reels. */
export default async function ReelsPage() {
  const access = await reelsAccess();
  if (access.gate) return access.gate;
  const { workspaceId, brandId, perms } = access;

  return (
    // Remount on brand switch: a plan streaming for the old brand never opens its reel here.
    <ReelsHome key={brandId} workspaceId={workspaceId} brandId={brandId} canCreate={perms.has("content.create")} canPublish={perms.has("publish.execute")} />
  );
}
