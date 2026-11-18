import {
  BRIEF_MAX,
  type BACKGROUNDS,
  type FASHION_RATIOS,
  type MODELS,
  type POSES,
  type PRODUCT_RATIOS,
  type SCENES,
  type Shoot,
  type ShootRequest,
  type ShootTier,
} from "@/shared";
import type { JobStep } from "@/components/ui/job-progress";
import { stale } from "@/components/workspace/use-job";

/** The studio's choices, before they become a request. Pure: no React. */
export type Scene = (typeof SCENES)[number];
export type Pose = (typeof POSES)[number];
export type Background = (typeof BACKGROUNDS)[number];
export type FashionRatio = (typeof FASHION_RATIOS)[number];
export type Model = (typeof MODELS)[number];
export type ShootKind = ShootRequest["kind"];

/** The photo the shoot starts from: its storage key, plus a title and preview link to show it by. */
export type Source = { sourceKey: string | null; sourceTitle: string | null; sourceUrl: string | null };
export type ProductSetup = Source & { ratio: (typeof PRODUCT_RATIOS)[number]; scene: Scene; brief: string; tier: ShootTier };
export type FashionSetup = Source & { ratio: FashionRatio; model: Model | null; pose: Pose; background: Background; tier: ShootTier };

const NO_SOURCE: Source = { sourceKey: null, sourceTitle: null, sourceUrl: null };
export const DEFAULT_PRODUCT: ProductSetup = { ...NO_SOURCE, ratio: "1:1", scene: "studio", brief: "", tier: "base" };
export const DEFAULT_FASHION: FashionSetup = { ...NO_SOURCE, ratio: "4:5", model: null, pose: "fullBody", background: "studioMinimal", tier: "base" };

/** Why Generate can't run yet, in the phone's words; null when it can. */
export function generateBlocker(kind: ShootKind, s: ProductSetup | FashionSetup): string | null {
  if (kind === "fashion") return s.sourceKey ? null : "Upload a garment photo to enable generation";
  if (!s.sourceKey) return "Choose a photo";
  const brief = (s as ProductSetup).brief.trim();
  if ((s as ProductSetup).scene === "custom" && !brief) return "Describe the scene to use Custom.";
  if (brief.length > BRIEF_MAX) return `Keep the brief under ${BRIEF_MAX} characters.`;
  return null;
}

/** The request Generate sends. Call only when generateBlocker is null. No model picked: the shoot chooses one. */
export function toRequest(kind: ShootKind, s: ProductSetup | FashionSetup): ShootRequest {
  const blocker = generateBlocker(kind, s);
  if (blocker !== null) throw new Error(`toRequest on a shoot that can't run: ${blocker}`);
  const sourceKey = s.sourceKey as string;
  if (kind === "product") {
    const p = s as ProductSetup;
    return { kind, tier: p.tier, sourceKey, ratio: p.ratio, scene: p.scene, brief: p.brief.trim() };
  }
  const f = s as FashionSetup;
  return { kind, tier: f.tier, sourceKey, ratio: f.ratio, pose: f.pose, background: f.background, ...(f.model ? { model: f.model } : {}) };
}

/** Try again / Variation: the shoot's own request as it was sent, its tier included (priced at SHOOT_CREDITS[input.tier]). */
export const retryRequest = (shoot: Shoot): ShootRequest => shoot.input;

const STEP_LABELS = ["Processing catalog asset", "Composing scene & lighting", "Finishing & color calibration"] as const;
const STEP_STATES: Record<Shoot["status"] | "none", JobStep["state"][]> = {
  none: ["active", "waiting", "waiting"],
  RUNNING: ["done", "active", "waiting"],
  DONE: ["done", "done", "done"],
  FAILED: ["done", "failed", "waiting"],
};

/** The phone's three generating steps (generating.tsx), for JobProgress. `null`: the shoot isn't read yet. */
export function shootSteps(shoot: Shoot | null): JobStep[] {
  const states = STEP_STATES[shoot?.status ?? "none"];
  return STEP_LABELS.map((label, i) => ({ label, state: states[i] }));
}

export function countByKind(shoots: readonly Shoot[]): { all: number; product: number; fashion: number } {
  const product = shoots.filter((s) => s.kind === "product").length;
  return { all: shoots.length, product, fashion: shoots.length - product };
}

/**
 * `next`, but with `prev`'s signed links (the source, and each shot's url and download link by key) while `prev`'s
 * are fresh, so an image doesn't reload on every poll. A shot `prev` lacks, or a download link it lacks, comes from `next`.
 */
/**
 * When the links keepLinks returned were fetched: a kept result mixes `prev`'s links with `next`'s (new shots, a
 * download link `prev` lacked), so it is as old as the older of the two answers; otherwise as old as `next`.
 */
export function linksFetchedAt(prevFetchedAt: number | undefined, fetchedAt: number, now = Date.now()): number {
  return prevFetchedAt !== undefined && !stale(prevFetchedAt, now) ? Math.min(prevFetchedAt, fetchedAt) : fetchedAt;
}

export function keepLinks(prev: Shoot | undefined, next: Shoot, prevFetchedAt: number, now = Date.now()): Shoot {
  if (!prev || stale(prevFetchedAt, now)) return next;
  const old = new Map(prev.shots.map((s) => [s.key, s]));
  return {
    ...next,
    sourceUrl: prev.sourceUrl,
    shots: next.shots.map((s) => {
      const o = old.get(s.key);
      if (!o) return s;
      const downloadUrl = o.downloadUrl ?? s.downloadUrl;
      return { ...s, url: o.url, ...(downloadUrl ? { downloadUrl } : {}) };
    }),
  };
}

// Shoot ids are UUIDs: the server uses the create call's requestId (a UUID) as the id. Anything else in ?shoot= or [id] is not one.
const SHOOT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Whether a URL value (`?shoot=`, `[id]`) can be a shoot id. */
export const isShootId = (s: unknown): s is string => typeof s === "string" && SHOOT_ID.test(s);

/** The list with `shoot` first (a shoot just created), any older copy of it dropped. */
export const prependShoot = (shoots: readonly Shoot[], shoot: Shoot): Shoot[] => [shoot, ...shoots.filter((s) => s.id !== shoot.id)];

/**
 * The shoot page's save control: the attachment link only `GET …/photoshoots/{id}` signs, else (an answer without one,
 * e.g. the create call's) the image itself in a new tab.
 */
export function downloadLink(shot: Shoot["shots"][number]): { href: string; label: string; newTab: boolean } {
  return shot.downloadUrl
    ? { href: shot.downloadUrl, label: "Download photo", newTab: false }
    : { href: shot.url, label: "Open full size", newTab: true };
}
