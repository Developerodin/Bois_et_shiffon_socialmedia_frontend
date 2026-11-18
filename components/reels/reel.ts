import { REEL_DURATION_CHIPS, reelStage, type ReelDetail, type ReelSummary } from "@/shared";
import { stale } from "@/lib/signed-links";
import { starterProduct } from "./labels";

/** The reel page's steps, in order (spec §5.3). Pure: no React. */
export const REEL_STEPS = ["plan", "presenter", "photos", "script", "storyboard", "video", "review", "publish"] as const;
export type ReelStep = (typeof REEL_STEPS)[number];
// 3b adds presenter, photos, script; 3c adds video, review, publish.
export const BUILT_STEPS: readonly ReelStep[] = ["plan", "storyboard"];

/** Whether the reel's latest render is running: the shared rule (reelStage), applied to the detail's newest render. */
export const rendering = (d: ReelDetail): boolean => reelStage({ render: d.renders[0] ?? null, videoUrl: d.videoUrl }) === "processing";

/** Where a reel opens: the first thing still to do (spec §5.3). Not clamped to the built steps; see reachable. */
export function defaultStep(d: ReelDetail | null): ReelStep {
  if (!d?.plan) return "plan";
  if (d.plan.scenes.some((s) => s.standIn)) return "photos";
  if (rendering(d) || d.renders[0]?.step === "FAILED") return "video";
  if (d.videoUrl) return "review";
  return "storyboard";
}

/** `step` if it is built, else the storyboard with a plan, else the plan. */
export function reachable(step: ReelStep, d: ReelDetail | null): ReelStep {
  if (BUILT_STEPS.includes(step)) return step;
  return d?.plan ? "storyboard" : "plan";
}

/** The `?step=` value if it names a step, else the default one; either way a built step. */
export function stepFrom(param: unknown, d: ReelDetail | null): ReelStep {
  const named = REEL_STEPS.find((s) => s === param);
  return reachable(named ?? defaultStep(d), d);
}

/** The rail's small text under a step. Steps not built yet say nothing. */
export function stepState(step: ReelStep, d: ReelDetail | null): string {
  if (step === "plan") return d?.plan ? "Done" : "None";
  if (step !== "storyboard") return "";
  if (!d?.plan) return "None";
  if (d.plan.scenes.some((s) => s.standIn)) return "Needs a photo";
  if (rendering(d)) return "Making…";
  return d.videoUrl ? "Done" : "Ready";
}

/** The length chips worth offering: those more than 5 seconds from the current length. */
export const durationChips = (seconds: number | null): number[] =>
  REEL_DURATION_CHIPS.filter((c) => seconds === null || Math.abs(c - seconds) > 5);

export type Starter = { label: string; message: string; opportunityId?: string };

/** Up to three ways to begin a reel: the brand's reel ideas first (callers pass ideas.filter(isReelIdea)), then its products. */
export function starters(ideas: { id: string; title: string }[], productTitles: string[]): Starter[] {
  const fromIdeas = ideas.map((i): Starter => ({ label: i.title, message: i.title, opportunityId: i.id }));
  const fromProducts = productTitles.map((p): Starter => ({ label: p, message: starterProduct(p) }));
  return [...fromIdeas, ...fromProducts].slice(0, 3);
}

export function countByStage(reels: ReelSummary[]): { all: number; ready: number; processing: number } {
  const count = (stage: string) => reels.filter((r) => reelStage(r) === stage).length;
  return { all: reels.length, ready: count("ready"), processing: count("processing") };
}

// cuid (phone-made) or UUID (web-made); only keeps path-ish input out of the URL, the server decides existence.
export const isReelId = (s: unknown): s is string => typeof s === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(s);

/**
 * `next`, but with `prev`'s signed links while `prev`'s are fresh, so a picture or video doesn't reload on every poll:
 * the summary's thumb and video, or the detail's video and each photo by key. Only while it is the same reel and
 * version (and the same video file); anything new comes from `next`.
 */
export function keepReelLinks<T extends ReelSummary | ReelDetail>(prev: T | undefined, next: T, prevAt: number, now = Date.now()): T {
  if (!prev || stale(prevAt, now)) return next;
  if ("item" in next) {
    const p = prev as ReelDetail;
    if (p.item.id !== next.item.id || p.version !== next.version) return next;
    const photoUrls = Object.fromEntries(Object.entries(next.photoUrls).map(([k, u]) => [k, p.photoUrls[k] ?? u]));
    const videoUrl = next.videoUrl && p.videoUrl && p.videoKey === next.videoKey ? p.videoUrl : next.videoUrl;
    return { ...next, photoUrls, videoUrl };
  }
  const p = prev as ReelSummary;
  const n = next as ReelSummary;
  if (p.id !== n.id || p.version !== n.version) return next;
  return { ...n, thumbUrl: n.thumbUrl && p.thumbUrl ? p.thumbUrl : n.thumbUrl, videoUrl: n.videoUrl && p.videoUrl ? p.videoUrl : n.videoUrl } as T;
}
