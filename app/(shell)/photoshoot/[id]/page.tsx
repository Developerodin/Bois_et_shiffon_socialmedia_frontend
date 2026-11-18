import { photoshootAccess } from "@/components/photoshoot/access";
import { ShootDetail, ShootNotFound } from "@/components/photoshoot/shoot-detail";
import { isShootId } from "@/components/photoshoot/shoot";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/photoshoot").title };

/** One photoshoot of the active business: its photos, what it was staged with, and Variation. */
export default async function ShootPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await photoshootAccess();
  if (access.gate) return access.gate;
  const { workspaceId, brandId, perms } = access;

  const { id } = await params;
  // Not a shoot id: no shoot to ask the server for.
  if (!isShootId(id)) return <ShootNotFound />;

  return (
    <ShootDetail
      // Remount on brand switch: the shoot belongs to one brand, and the next brand answers 404 for it.
      key={brandId}
      workspaceId={workspaceId}
      brandId={brandId}
      shootId={id}
      canCreate={perms.has("content.create")}
    />
  );
}
