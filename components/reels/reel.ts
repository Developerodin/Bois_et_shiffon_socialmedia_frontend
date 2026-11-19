import { MAX_SCENE_WORDS, REEL_DURATION_CHIPS, REEL_SENDABLE, VOICE_TEXT_MAX, WORDS_PER_SECOND, reelStage, wordCount, type CaptionCue, type CheckResult, type PlanResult, type ReelDetail, type ReelOptions, type ReelPlan, type ReelScene, type ReelSummary } from "@/shared";
import { ApiError, type Connection } from "@/components/settings/api";
import type { JobStep } from "@/components/ui/job-progress";
import { creditsText } from "@/lib/plan-credits";
import { stale } from "@/lib/signed-links";
import { RENDER_STAGES, starterProduct } from "./labels";

/** The reel page's steps, in order (spec §5.3). Pure: no React. */
export const REEL_STEPS = ["plan", "presenter", "photos", "script", "storyboard", "video", "review", "publish"] as const;
export type ReelStep = (typeof REEL_STEPS)[number];
export const BUILT_STEPS: readonly ReelStep[] = REEL_STEPS;

// In its own import-free module so links from outside the reel page (the Overview) don't pull this file in.
export { reelHref } from "./href";

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
  if (step === "video") {
    if (d && rendering(d)) return "Making…";
    if (d?.videoUrl) return "Done";
    return d?.renders[0]?.step === "FAILED" ? "Didn't work" : "None";
  }
  if (step === "review") {
    if (!d?.videoUrl) return "None";
    return ["APPROVED", "SCHEDULED", "PUBLISHED"].includes(d.item.status) ? "Done" : "Ready";
  }
  if (step === "publish") {
    if (d?.item.status === "PUBLISHED") return "Posted";
    if (d?.item.status === "SCHEDULED") return "Scheduled";
    return d?.videoUrl ? "Ready" : "None";
  }
  if (step !== "storyboard" && step !== "photos") return "";
  if (!d?.plan) return "None";
  if (d.plan.scenes.some((s) => s.standIn)) return "Needs a photo";
  if (step === "photos") return "Done";
  if (rendering(d)) return "Making…";
  return d.videoUrl ? "Done" : "Ready";
}

/** A video exists, in review, and its checks haven't come in yet. */
export const awaitingChecks = (d: ReelDetail): boolean => !!d.videoUrl && !d.checks && d.item.status === "DRAFT_REVIEW";

/** The Review step's wait for the checks: one automatic recheck (creators), the slow line with Check again, and the end of its polling. */
export const CHECK_AUTO_MS = 90_000;
export const CHECK_SLOW_MS = 150_000;
export const CHECK_WAIT_MS = 10 * 60_000;

/** The wait before the Review step reads the reel again, `elapsed` ms into its wait for the checks (spec §5.8): 5 s for 2 minutes, then 10 s; null from CHECK_WAIT_MS on (it stops). */
export const checksPollDelay = (elapsed: number): number | null =>
  elapsed >= CHECK_WAIT_MS ? null : elapsed < 120_000 ? 5_000 : 10_000;

/**
 * The Review step's wait for the checks: `read` on checksPollDelay, its clock counted from this call (slow reads don't
 * stretch the 2- and 10-minute marks), then `onEnd`. The next wait starts only once a read settles, so a read slower
 * than the interval never queues another behind it (fetchShared's fresh reads queue rather than join). `skip` (a hidden
 * tab) passes a tick without reading. Returns the stop: nothing runs after it, even when a read settles later.
 */
export function pollChecks(read: () => Promise<unknown>, onEnd: () => void, skip: () => boolean = () => false): () => void {
  const start = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const next = () => {
    if (stopped) return;
    const delay = checksPollDelay(Date.now() - start);
    if (delay === null) return onEnd();
    timer = setTimeout(() => {
      if (skip()) return next();
      read().catch(() => undefined).finally(next);
    }, delay);
  };
  next();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

const RENDER_ORDER = ["VOICE", "CLIPS", "JOIN"] as const;

/** The running render's three stages for the progress list; every stage waits when none is running. */
export function renderSteps(d: ReelDetail): JobStep[] {
  const n = d.plan?.scenes.length ?? 0;
  const at = rendering(d) ? RENDER_ORDER.indexOf(d.renders[0]!.step as (typeof RENDER_ORDER)[number]) : -1;
  return RENDER_ORDER.map((stage, i) => ({ label: RENDER_STAGES[stage](n), state: i < at ? "done" : i === at ? "active" : "waiting" }));
}

/** How long a render runs before the Video step says it's taking longer than usual (polling goes on). */
export const RENDER_SLOW_MS = 15 * 60_000;

/** A running render started more than RENDER_SLOW_MS before `now`: counted from its own start, so a page opened late says so at once. */
export function renderLong(d: ReelDetail, now: number): boolean {
  if (!rendering(d)) return false;
  const started = Date.parse(d.renders[0]!.createdAt);
  return Number.isFinite(started) && now - started > RENDER_SLOW_MS;
}

/** Why Make video is off, or null: stand-in photos, an edit lock, or a plan chat or save that would move the version under the press. */
export function makeVideoBlock(d: ReelDetail, chatBusy: boolean, saving: boolean): string | null {
  if (d.plan?.scenes.some((s) => s.standIn)) return "A scene's photo shows something else. Pick the right one before making the video.";
  const lock = editLock(d);
  if (lock) return lock;
  return chatBusy || saving ? "Wait for the plan to finish saving." : null;
}

/** What to do with a refused render press: read the reel again, and whether the version already has its video (go to Review). */
export function renderRefusal(e: unknown): { reread: boolean; review: boolean } {
  if (!(e instanceof ApiError) || e.status !== 409) return { reread: false, review: false };
  return { reread: true, review: e.code === "render.alreadyDone" };
}

/** The line to say when a render that was running has ended between two reads, else null. */
export function renderNews(prev: ReelDetail | null, next: ReelDetail): string | null {
  if (!prev || !rendering(prev)) return null;
  const step = next.renders[0]?.step;
  if (step === "DONE") return "Your reel is ready.";
  if (step === "FAILED") return "The video couldn't be made. Your credits are back.";
  return null;
}

/** After a failed try: the price now, when it differs from what the last try cost. */
export function retryPriceNote(d: ReelDetail, unlimited: boolean): string | null {
  const credits = d.renders[0]?.credits;
  if (unlimited || typeof credits !== "number" || typeof d.price !== "number" || credits === d.price) return null;
  return `Making it again costs ${creditsText(d.price)} now; the last try cost ${creditsText(credits)}.`;
}

const CHECKING = "Checking the reel… Download and Publish open when the checks are done.";

/** Why Download and Publish are off, or null. A reel sent back or rejected says so instead of "checking". */
export function sendBlock(d: ReelDetail): string | null {
  const status = d.item.status;
  if (d.checks?.overall === "BLOCKER") return "A check found a problem (see Checks). Fix it in the caption, or ask for changes.";
  if (awaitingChecks(d)) return CHECKING;
  if (d.checks && status === "DRAFT_REVIEW") return "Changes were asked for (see the history under Publish). Change the caption or the plan and it's checked again.";
  if (status === "REJECTED") return "This reel was rejected. Change the caption or the plan to send it through review again.";
  if (REEL_SENDABLE.includes(status)) return null;
  // No check can be running from here on, so never say "Checking…".
  if (status === "DRAFT_REVIEW") return "Make the video first. Download and Publish open once it's made.";
  if (status === "BLOCKED") return "A check found a problem (see Checks). Fix it in the caption, or ask for changes.";
  return "This reel can't be sent in its current state.";
}

/** The checks to show: the saved results, then a warning per join the seam check softened in the render that made this video. */
export function reviewChecks(d: ReelDetail): CheckResult[] {
  if (!d.checks) return [];
  const made = d.renders.find((r) => r.step === "DONE" && r.videoKey === d.videoKey);
  const softened = (made?.softened ?? []).map((n): CheckResult => ({ check: `Scene ${n} → ${n + 1}`, status: "warn", note: "The two shots didn't quite match, so they blend with a dissolve" }));
  return [...d.checks.results, ...softened];
}

export const REEL_HASHTAGS_MAX = 5;
export const REEL_CAPTION_MAX = 2200;

/** Tags typed as text: split on spaces and commas, one # each, no repeats. The caller checks the count against REEL_HASHTAGS_MAX. */
export const parseHashtags = (text: string): string[] =>
  [...new Set(text.split(/[\s,]+/).map((t) => t.replace(/^#+/, "")).filter(Boolean))].map((t) => `#${t}`);

/** The posted text's length, joined as the server's postText does (caption, the AI line, the tags, a blank line between). */
export const postTextLength = (caption: string, aiLine: string | null, tags: readonly string[]): number =>
  [caption.trim(), aiLine, tags.join(" ")].filter(Boolean).join("\n\n").length;

const vttTime = (seconds: number): string => {
  const ms = Math.round(seconds * 1000);
  const p = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3_600_000))}:${p(Math.floor(ms / 60_000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`;
};

/** The caption cues as WebVTT. Text is escaped, so a spoken line can't add a timing line or a tag. */
export const toWebVtt = (cues: readonly CaptionCue[]): string =>
  "WEBVTT\n\n" + cues.map((c, i) => {
    const text = c.text.replace(/\s+/g, " ").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return `${i + 1}\n${vttTime(c.start)} --> ${vttTime(c.end)}\n${text}\n\n`;
  }).join("");

/** An approved reel with no post link yet (the phone's results screen asks for one). */
export const postLinkWanted = (r: ReelSummary): boolean => r.status === "APPROVED" && !r.postUrl;

/** Which Instagram account a reel would go to: the first active one, else a lapsed one, else none. */
export function instagramState(cs: readonly Pick<Connection, "provider" | "status" | "displayName">[]): { state: "active"; name: string } | { state: "expired" } | { state: "none" } {
  const ig = cs.filter((c) => c.provider === "INSTAGRAM");
  const active = ig.find((c) => c.status === "ACTIVE");
  if (active) return { state: "active", name: active.displayName };
  return ig.length ? { state: "expired" } : { state: "none" };
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
 * version (the detail's video link: the same video file, whatever the version); anything new comes from `next`.
 */
export function keepReelLinks<T extends ReelSummary | ReelDetail>(prev: T | undefined, next: T, prevAt: number, now = Date.now()): T {
  if (!prev || stale(prevAt, now)) return next;
  if ("item" in next) {
    const p = prev as ReelDetail;
    if (p.item.id !== next.item.id) return next;
    // A caption save moves the version, not the file: the video link follows its key, photos follow the version.
    const photoUrls = p.version === next.version ? Object.fromEntries(Object.entries(next.photoUrls).map(([k, u]) => [k, p.photoUrls[k] ?? u])) : next.photoUrls;
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

/** After a save the server refused as changed (409) and the reel was re-read: the edit restarts from the re-read version, its content kept, so "save again" works. Any other time the edit is returned as it was. */
export function adoptRefusedVersion<E extends { version: number }>(edit: E, refused: boolean, version: number): E {
  return refused && edit.version !== version ? { ...edit, version } : edit;
}

/** Per scene, whether its take still goes with its text: the server keeps a take only on an exact match with the trimmed saved text. */
export const recordedScenes = (scenes: readonly ReelScene[], texts: readonly string[]): boolean[] =>
  scenes.map((s, i) => !!s.recordingId && (texts[i] ?? "").trim() === s.voiceText);

/** One line per scene whose take the server dropped on a save (scene numbers, 1-based). */
export const droppedRecordings = (dropped: readonly number[] | undefined): string[] =>
  (dropped ?? []).map((n) => `Scene ${n}'s recording was removed: its text changed. Record it again if you want.`);

/** Whether a saved take stayed on its scene (0-based): the server drops it when the text moved on meanwhile. */
export const takeLanded = (out: Pick<PlanResult, "plan" | "droppedRecordings">, scene: number, recordingId: string): boolean =>
  !(out.droppedRecordings ?? []).includes(scene + 1) && out.plan.scenes[scene]?.recordingId === recordingId;

/** A voice sample plays only from a secure link; blob: is for a take the person just made. */
export const playableSample = (url: string): boolean => /^(https|blob):/i.test(url);

/** What pressing a sample's button does: the playing one stops, another starts, a link that isn't playable is refused. */
export function sampleAction(playing: string | null, id: string, url: string): "stop" | "play" | "refuse" {
  if (playing === id) return "stop";
  return playableSample(url) ? "play" : "refuse";
}
