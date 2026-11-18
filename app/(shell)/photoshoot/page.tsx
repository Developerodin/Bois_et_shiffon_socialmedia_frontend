import { photoshootAccess } from "@/components/photoshoot/access";
import { Studio } from "@/components/photoshoot/studio";
import { isShootId } from "@/components/photoshoot/shoot";
import { navFor } from "@/lib/nav";

export const metadata = { title: navFor("/photoshoot").title };

/** The photoshoot studio: set up a product or fashion shoot, follow the one just started, and browse past shoots. */
export default async function PhotoshootPage({ searchParams }: { searchParams: Promise<{ shoot?: string | string[]; b?: string | string[] }> }) {
  const access = await photoshootAccess();
  if (access.gate) return access.gate;
  const { workspaceId, brandId, perms } = access;

  // ?shoot= only counts for the brand it was made in: after a brand switch the old id would be another brand's.
  const q = await searchParams;
  const initialShootId = isShootId(q.shoot) && q.b === brandId ? q.shoot : null;

  return (
    <Studio
      // Remount on brand switch so the setups, the current shoot and the filter reset cleanly.
      key={brandId}
      workspaceId={workspaceId}
      brandId={brandId}
      canCreate={perms.has("content.create")}
      canUpload={perms.has("content.create")}
      initialShootId={initialShootId}
    />
  );
}
