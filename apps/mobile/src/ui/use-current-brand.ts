import { useEffect, useSyncExternalStore } from "react";
import { brandAssets, currentBrand, type BrandAssetsView } from "@/api/endpoints";

/**
 * The business the app works on, for module headers, switchers and the Business screens: its name, then its full
 * brand view (logo, colours, products, summary, preferences) once loaded. One lookup per business, shared by every
 * screen. Null while loading or when it can't be read.
 * ponytail: signed image URLs last an hour; a longer session shows the name without the logo after that.
 */
type Brand = { id: string; workspaceId: string; name: string; logoUrl: string | null; view: BrandAssetsView | null };
let brand: Brand | null = null;
let started = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const set = (b: Brand | null) => {
  brand = b;
  listeners.forEach((l) => l());
};

async function load() {
  const b = await currentBrand();
  set({ id: b.brandId, workspaceId: b.workspaceId, name: b.name, logoUrl: null, view: null });
  const view = await brandAssets(b.workspaceId, b.brandId);
  if (brand?.id === b.brandId) set({ ...brand, name: view.name, logoUrl: view.assets?.logo?.url ?? null, view });
}

/** Switching business or signing out: every mounted screen loads the new one. */
export function forgetCurrentBrand() {
  started = false;
  set(null);
}

/** After an edit the server answers with the new view (PATCH …/assets): every screen shows it at once. */
export function setBrandView(view: BrandAssetsView) {
  if (brand) set({ ...brand, name: view.name, logoUrl: view.assets?.logo?.url ?? null, view });
}

/** Read the view again (e.g. the Photos screen's Refresh). */
export async function reloadCurrentBrand() {
  started = true;
  await load().finally(() => void (started = false));
}

export function useCurrentBrand() {
  const b = useSyncExternalStore(subscribe, () => brand);
  // Runs again when the brand is forgotten (switching business), so mounted headers show the new one.
  useEffect(() => {
    if (b || started) return;
    started = true;
    load().catch(() => void (started = false)); // the next screen to mount tries again
  }, [b]);
  return b;
}
