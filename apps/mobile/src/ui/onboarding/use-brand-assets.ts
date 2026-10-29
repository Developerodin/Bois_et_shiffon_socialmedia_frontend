import { useEffect, useSyncExternalStore } from "react";
import { brandAssets, renameBrand, updateBrandDetails, type BrandAssetsView, type StoredImage } from "@/api/endpoints";
import { onboarding } from "@/ui/onboarding/state";

/**
 * The onboarding brand's assets, shared by A09–A12: one fetch per brand, and a palette saved on A10 shows on
 * every mounted screen at once. `data` stays null while loading and when the fetch fails (screens still work).
 * ponytail: kept for the app session; signed image URLs last an hour, refetch on a 403 if onboarding ever takes that long.
 */
type Entry = { data: BrandAssetsView | null; loading: boolean; failed?: boolean };
const IDLE: Entry = { data: null, loading: false };
const LOADING: Entry = { data: null, loading: true };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

function put(brandId: string, entry: Entry) {
  entries.set(brandId, entry);
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

// Per brand *and* Research run: a retried run collects again, so its screens fetch again.
const keyOf = () => (onboarding.brandId ? `${onboarding.brandId}:${onboarding.researchRunId ?? ""}` : null);

export function useBrandAssets(): Entry {
  const { workspaceId, brandId } = onboarding;
  const key = keyOf();
  const entry = useSyncExternalStore(subscribe, () => (key ? entries.get(key) ?? LOADING : IDLE));

  useEffect(() => {
    if (!workspaceId || !brandId || !key) return;
    const current = entries.get(key);
    if (current && !current.failed) return; // loaded or in flight; a failed fetch is retried by the next screen
    const pending: Entry = { data: null, loading: true };
    put(key, pending);
    // Only land if nothing replaced the entry meanwhile (a palette saved while this was in flight wins).
    const land = (next: Entry) => entries.get(key) === pending && put(key, next);
    brandAssets(workspaceId, brandId).then(
      (data) => land({ data, loading: false }),
      () => land({ data: null, loading: false, failed: true }),
    );
  }, [workspaceId, brandId, key]);

  return entry;
}

function ids() {
  const { workspaceId, brandId } = onboarding;
  const key = keyOf();
  if (!workspaceId || !brandId || !key) throw new Error("No brand yet");
  return { workspaceId, brandId, key };
}

/** Replace one part of the stored view (others may be mid-edit, so never the whole view). */
function patch(key: string, change: (d: BrandAssetsView) => BrandAssetsView) {
  const e = entries.get(key);
  if (e?.data) put(key, { ...e, data: change(e.data) });
}

/** Saves the palette (A10) and updates every screen with what the server stored. Throws on failure. */
export async function saveBrandColors(hexes: string[]) {
  const { workspaceId, brandId, key } = ids();
  const view = await updateBrandDetails(workspaceId, brandId, { colors: hexes });
  patch(key, (d) => ({ ...d, assets: view.assets }));
}

/** Saves tones and content language (A10). Throws on failure. */
export async function saveBrandPreferences(prefs: { tones: string[]; contentLanguage: "fr" | "en" }) {
  const { workspaceId, brandId, key } = ids();
  const view = await updateBrandDetails(workspaceId, brandId, prefs);
  patch(key, (d) => ({ ...d, preferences: view.preferences }));
}

type TextField = "name" | "tagline" | "audience";
const EMPTY_SUMMARY = { tagline: null, tags: [], audience: null, strengths: null, foundWebsite: null };
const readText = (d: BrandAssetsView, f: TextField) => (f === "name" ? d.name : (d.summary?.[f] ?? null));
const withText = (d: BrandAssetsView, f: TextField, v: string | null): BrandAssetsView =>
  f === "name" ? { ...d, name: v ?? d.name } : { ...d, summary: { ...(d.summary ?? EMPTY_SUMMARY), [f]: v } };
const seq = new Map<string, number>();

/**
 * A09 text edit: shows at once, then saves. Only the newest edit of a field may land or roll back, and it touches
 * only that field, so editing the tagline and the audience back to back can't undo each other. Throws on failure.
 */
export async function saveBrandText(field: TextField, value: string) {
  const { workspaceId, brandId, key } = ids();
  const before = entries.get(key)?.data;
  if (!before) throw new Error("Not loaded yet");
  const n = (seq.get(`${key}:${field}`) ?? 0) + 1;
  seq.set(`${key}:${field}`, n);
  const latest = () => seq.get(`${key}:${field}`) === n;
  const previous = readText(before, field);
  patch(key, (d) => withText(d, field, value));
  try {
    if (field === "name") await renameBrand(workspaceId, brandId, value);
    else {
      const view = await updateBrandDetails(workspaceId, brandId, { [field]: value });
      if (latest()) patch(key, (d) => withText(d, field, readText(view, field)));
    }
  } catch (error) {
    if (latest()) patch(key, (d) => withText(d, field, previous));
    throw error;
  }
}

/** expo-image source that caches by the storage key, not the signed URL (which changes every fetch). */
export const imageSource = (img: StoredImage) => ({ uri: img.url, cacheKey: img.key });
