import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { brandAssets, currentBrand, type BrandAssetsView } from "@/api/endpoints";

/**
 * The business the app works on, for module headers, switchers and the Business screens: its name, then its full
 * brand view (logo, colours, products, uploads, summary, preferences) once loaded. One lookup per business, shared by
 * every screen. Null while the business itself is being looked up.
 * Signed image links last an hour, so a view older than STALE_MS is read again when a screen comes into focus.
 */
type Brand = { id: string; workspaceId: string; name: string; logoUrl: string | null; view: BrandAssetsView | null; loadedAt: number };
const STALE_MS = 50 * 60_000;
let brand: Brand | null = null;
let loading = false;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const set = (b: Brand | null) => {
  brand = b;
  listeners.forEach((l) => l());
};
const withView = (b: Brand, view: BrandAssetsView): Brand => ({ ...b, name: view.name, logoUrl: view.assets?.logo?.url ?? null, view, loadedAt: Date.now() });

/** Reads the business (and its view); a reload keeps what's shown until the new view lands. */
async function load() {
  if (loading) return;
  loading = true;
  try {
    const b = await currentBrand();
    if (brand?.id !== b.brandId) set({ id: b.brandId, workspaceId: b.workspaceId, name: b.name, logoUrl: null, view: null, loadedAt: 0 });
    const view = await brandAssets(b.workspaceId, b.brandId);
    if (brand?.id === b.brandId) set(withView(brand, view));
  } finally {
    loading = false;
  }
}

/** Switching business or signing out: every mounted screen loads the new one. */
export function forgetCurrentBrand() {
  set(null);
}

/**
 * After an edit the server answers with the new view (PATCH …/assets): every screen shows it at once. `brandId`: the
 * business the edit was for; an answer that lands after a switch to another business is dropped.
 */
export function setBrandView(view: BrandAssetsView, brandId: string) {
  if (brand && brand.id === brandId) set(withView(brand, view));
}

/** Read the view again (Photos' Refresh, after an upload). */
export const reloadCurrentBrand = () => load();

export function useCurrentBrand() {
  const b = useSyncExternalStore(subscribe, () => brand);
  // No business yet, or its view never loaded (a failed request): try again.
  useEffect(() => {
    if (!b || !b.view) void load().catch(() => {});
  }, [b]);
  useFocusEffect(
    useCallback(() => {
      if (brand?.view && Date.now() - brand.loadedAt > STALE_MS) void load().catch(() => {});
    }, []),
  );
  return b;
}

/** A website address as people say it: "boisetchiffons.fr" (no scheme, www or trailing slash). */
export const siteLabel = (url: string | null | undefined) => (url ? url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "") : null);

export type LibraryPhoto = { key: string; url: string; title: string; kind: string | null };
/** The brand's photo library, as every picker offers it: the website's product photos, then the owner's uploads. */
export const libraryPhotos = (view: BrandAssetsView | null | undefined): LibraryPhoto[] => [
  ...(view?.assets?.products ?? []).flatMap((p) => (p.image ? [{ key: p.image.key, url: p.image.url, title: p.title, kind: p.kind }] : [])),
  ...(view?.uploads ?? []).flatMap((u) => (u.image ? [{ key: u.image.key, url: u.image.url, title: u.title, kind: null }] : [])),
];
