import { useEffect, useSyncExternalStore } from "react";
import { brandAssets, currentBrand } from "@/api/endpoints";

/**
 * The business the app works on, for module headers and switchers: its name, then its logo once loaded.
 * One lookup per app session, shared by every header. Null while loading or when it can't be read.
 * ponytail: the signed logo URL lasts an hour; a longer session shows the name without the logo after that.
 */
type Brand = { id: string; name: string; logoUrl: string | null };
let brand: Brand | null = null;
let started = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const set = (b: Brand) => {
  brand = b;
  listeners.forEach((l) => l());
};

async function load() {
  const b = await currentBrand();
  set({ id: b.brandId, name: b.name, logoUrl: null });
  const view = await brandAssets(b.workspaceId, b.brandId);
  if (brand?.id === b.brandId) set({ ...brand, logoUrl: view.assets?.logo?.url ?? null });
}

/** Switching business: headers show the new one. */
export function forgetCurrentBrand() {
  brand = null;
  started = false;
  listeners.forEach((l) => l());
}

export function useCurrentBrand() {
  const b = useSyncExternalStore(subscribe, () => brand);
  useEffect(() => {
    if (started) return;
    started = true;
    load().catch(() => void (started = false)); // the next header to mount tries again
  }, []);
  return b;
}
