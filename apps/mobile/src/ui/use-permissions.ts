import { useEffect, useState } from "react";
import { myPermissions } from "@/api/endpoints";
import { useCurrentBrand } from "@/ui/use-current-brand";

/**
 * The person's permissions on the current business, so screens don't offer what the server would refuse
 * (approving needs content.approve, scheduling publish.execute). Null while loading: show actions, the server decides.
 */
export function usePermissions() {
  const brand = useCurrentBrand();
  const [perms, setPerms] = useState<{ brandId: string; set: Set<string> } | null>(null);
  useEffect(() => {
    if (!brand) return;
    let live = true;
    myPermissions().then((set) => live && setPerms({ brandId: brand.id, set }), () => {});
    return () => void (live = false);
  }, [brand?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = perms && perms.brandId === brand?.id ? perms.set : null;
  return { can: (p: string) => set === null || set.has(p), loaded: set !== null };
}
