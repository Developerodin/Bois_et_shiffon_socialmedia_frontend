import { MAX_SCENE_WORDS, REEL_DURATION_CHIPS, VOICE_TEXT_MAX, WORDS_PER_SECOND, reelStage, wordCount, type ReelDetail, type ReelOptions, type ReelPlan, type ReelScene, type ReelSummary } from "@/shared";
import { stale } from "@/lib/signed-links";
import { starterProduct } from "./labels";

/** The reel page's steps, in order (spec §5.3). Pure: no React. */
export const REEL_STEPS = ["plan", "presenter", "photos", "script", "storyboard", "video", "review", "publish"] as const;
export type ReelStep = (typeof REEL_STEPS)[number];
// 3c adds video, review, publish.
export const BUILT_STEPS: readonly ReelStep[] = ["plan", "presenter", "photos", "script", "storyboard"];

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
  if (step === "presenter") return !d?.plan ? "None" : d.plan.presenter === "none" ? "No presenter" : "Done";
  if (step === "script") return d?.plan ? "Done" : "None";
  if (step !== "storyboard" && step !== "photos") return "";
  if (!d?.plan) return "None";
  if (d.plan.scenes.some((s) => s.standIn)) return "Needs a photo";
  if (step === "photos") return "Done";
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

/** Why the reel can't be changed now, or null. The server refuses these edits too. */
export function editLock(d: ReelDetail): string | null {
  if (rendering(d)) return "A video is being made from this plan. Wait for it to finish.";
  if (d.item.status === "SCHEDULED" || d.item.status === "PUBLISHED") return "This reel is already scheduled or posted.";
  return null;
}

/** Whether any presenter or template preview is still being made. */
export const optionsMaking = (o: ReelOptions): boolean => o.presenters.some((p) => p.status === "RUNNING") || o.templates.some((t) => t.making);

/** The plan's presenter if it names a finished one of `options` (or options aren't read yet), else "none". */
export function presenterChoice(plan: ReelPlan, options: ReelOptions | null | undefined): string {
  if (plan.presenter === "none") return "none";
  if (!options) return plan.presenter;
  return options.presenters.some((p) => p.id === plan.presenter && p.status === "DONE") ? plan.presenter : "none";
}

/** The plan's presenter by name: "No presenter" for none (or one that isn't there), "…" while options are unread. */
export function presenterName(plan: ReelPlan, options: ReelOptions | null | undefined): string {
  if (plan.presenter === "none") return "No presenter";
  if (!options) return "…";
  return options.presenters.find((p) => p.id === plan.presenter)?.name ?? "No presenter";
}

/** Whether a press on a presenter or a template preview must wait: options unread, a presenter running, or that template making. */
export function optionBusy(options: ReelOptions | null | undefined, kind: "presenter" | { templateId: string }): boolean {
  if (!options) return true;
  if (kind === "presenter") return options.presenters.some((p) => p.status === "RUNNING");
  return options.templates.some((t) => t.id === kind.templateId && t.making);
}

/** A copy of `keys` with i and j swapped; out of range gives the copy unchanged. */
export function swapScenes(keys: readonly string[], i: number, j: number): string[] {
  const out = [...keys];
  if (i < 0 || j < 0 || i >= out.length || j >= out.length) return out;
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
}

/** Per scene, what stops the script being saved (a recorded scene's length is its recording's, so words don't count), or null. */
export function sceneProblems(texts: readonly string[], recorded: readonly boolean[]): (string | null)[] {
  return texts.map((raw, i) => {
    const text = raw.trim();
    const n = i + 1;
    if (text === "") return `Scene ${n} needs text.`;
    if (text.length > VOICE_TEXT_MAX) return `Scene ${n} is over ${VOICE_TEXT_MAX} characters.`;
    if (!recorded[i] && wordCount(text) > MAX_SCENE_WORDS) return `Scene ${n} is over ${MAX_SCENE_WORDS} words (${MAX_SCENE_WORDS / WORDS_PER_SECOND} s). Shorten it.`;
    return null;
  });
}

/** "38 words · ~19 s" for a scene's text. */
export function sceneCount(text: string): string {
  const n = wordCount(text);
  return `${n === 1 ? "1 word" : `${n} words`} · ~${Math.round(n / WORDS_PER_SECOND)} s`;
}

/** Per slot, whether its photo is one of the plan's stand-ins: the server's flag follows the photo (carryStandIns), so only a different photo clears it. */
export function slotStandIns(keys: readonly string[], plan: ReelPlan): boolean[] {
  const standIns = new Set(plan.scenes.filter((s) => s.standIn).map((s) => s.photoKey));
  return keys.map((k) => standIns.has(k));
}

/** After a save the server refused as changed (409) and the reel was re-read: the edit restarts from the re-read version, its items kept, so "save again" works. Any other time, or another scene count, the edit is returned as it was. */
export function adoptRefusedVersion<E extends { version: number; items: readonly unknown[] }>(edit: E, refused: boolean, version: number, scenes: number): E {
  return refused && edit.items.length === scenes && edit.version !== version ? { ...edit, version } : edit;
}

/** Per scene, whether its take still goes with its text: the server keeps a take only on an exact match with the trimmed saved text. */
export const recordedScenes = (scenes: readonly ReelScene[], texts: readonly string[]): boolean[] =>
  scenes.map((s, i) => !!s.recordingId && (texts[i] ?? "").trim() === s.voiceText);

/** One line per scene whose take the server dropped on a save (scene numbers, 1-based). */
export const droppedRecordings = (dropped: readonly number[] | undefined): string[] =>
  (dropped ?? []).map((n) => `Scene ${n}'s recording was removed: its text changed. Record it again if you want.`);

/** A voice sample plays only from a secure link; blob: is for a take the person just made. */
export const playableSample = (url: string): boolean => /^(https|blob):/i.test(url);

/** What pressing a sample's button does: the playing one stops, another starts, a link that isn't playable is refused. */
export function sampleAction(playing: string | null, id: string, url: string): "stop" | "play" | "refuse" {
  if (playing === id) return "stop";
  return playableSample(url) ? "play" : "refuse";
}
