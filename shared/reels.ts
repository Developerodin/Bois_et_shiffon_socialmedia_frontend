/** Reels: the plan and render shapes the server returns, the limits both sides check, and the rules the web and the phone share with the server. */
export const SCENE_KINDS = ["detail", "room", "physics"] as const;
/**
 * How a scene hands over to the next (the director picks; the seam check can soften it):
 * match = it ends on the framing the next starts from, cut = a deliberate cut on the voice's beat,
 * dissolve = a soft blend where place, light or distance changes.
 */
export const TRANSITIONS = ["cut", "match", "dissolve"] as const;
export type SceneKind = (typeof SCENE_KINDS)[number];
export type Transition = (typeof TRANSITIONS)[number];

// Mirrors mobile src/app/reels/storyboard.tsx MODEL_NAMES; keys must equal server router.ts VIDEO_MODELS (tested).
export const VIDEO_MODEL_NAMES: Readonly<Record<string, string>> = { "kling-3-std": "Kling 3.0", "seedance-2.5": "Seedance 2.5", "hailuo-2.3": "Hailuo 2.3" };

export const REEL_SCENES = { min: 2, max: 6 } as const;
export const MAX_SCENE_WORDS = 30; // 15 s, the longest clip Kling makes
export const VOICE_TEXT_MAX = 400;
export const CHAT_MESSAGE_MAX = 2000;
export const NAME_MAX = 40;
export const MAX_RECORDING_SECONDS = 15;
export const MAX_RECORDING_BYTES = 1024 * 1024; // 15 s of AAC at 128 kbps is ~250 KB
export const MAX_CLONE_BYTES = 4 * 1024 * 1024;
export const REEL_DURATION_CHIPS = [20, 30] as const;

/** Every content status the database has; the phone's narrower union is assignable to it. */
export type ContentStatus = "PLANNED" | "BRIEF_READY" | "DRAFT_REVIEW" | "REVIEWED" | "AWAITING_APPROVAL" | "APPROVED" | "SCHEDULED" | "PUBLISHED" | "REJECTED" | "BLOCKED" | "CANCELLED";

export type ReelScene = { photoKey: string; shot: string; direction: string; onScreenText: string; voiceText: string; kind?: SceneKind; model?: string; prompt?: string; standIn?: boolean; transition?: Transition; presenter?: boolean; recordingId?: string; recordingSeconds?: number };
export type TemplatePreview = { videoKey: string; videoUrl: string; posterKey: string; posterUrl: string };
export type ReelTemplateOption = { id: string; seconds: number; preview: TemplatePreview | null; own: boolean; making: boolean; failed: boolean };
/** A voice a reel may use: "coral" (OpenAI) or "eleven:<id>" (ElevenLabs); sampleUrl to listen to, when there is one. */
export type ReelVoiceOption = { id: string; name: string; gender: "female" | "male" | "neutral" | "clone"; sampleUrl: string | null; clone: boolean; mine: boolean };
/** A voice from ElevenLabs' public library ("library:<id>"); traits are ElevenLabs' own words (e.g. "middle_aged"). */
export type LibraryVoice = { id: string; name: string; gender: string | null; age: string | null; accent: string | null; language: string | null; useCase: string | null; previewUrl: string | null };
export type LibraryFilters = { language?: string; gender?: string; age?: string; useCase?: string; search?: string; page?: number };
/** What cloning needs: whether this person may (workspace admins), its price, the cap, the reading length, the consent text. */
export type CloningInfo = { allowed: boolean; credits: number; max: number; seconds: { min: number; max: number }; consent: string };
export type Presenter = { id: string; name: string; status: "RUNNING" | "DONE" | "FAILED"; sheet: { key: string; url: string } | null };
/** A trait group (gender, age…) and its options, id → English label (the app shows its own words when it has them). */
export type PresenterTrait = { id: string; options: Record<string, string> };
export type ReelOptions = { templates: ReelTemplateOption[]; previewCredits: number; canPreview: boolean; presenters: Presenter[]; traits: PresenterTrait[]; presenterCredits: number };
/** presenter: "none", or one of the brand's presenter ids. */
export type ReelPlan = { voiceName?: string; title: string; presenter: string; template: string; voice: string; language?: string; scenes: ReelScene[]; caption: string; hashtags: string[] };
export type RenderStep = "VOICE" | "CLIPS" | "JOIN" | "DONE" | "FAILED";
/** Why a render failed, as a kind the app words itself (apps/server/server/reels/render.ts renderFailure). */
export type RenderFailure = { kind: "unavailable" | "slow" | "scene" | "voiceDeleted" | "other"; scene?: number; stoppedAt: "VOICE" | "CLIPS" | "JOIN" };
export type ReelSummary = {
  id: string; title: string; status: ContentStatus; version: number; postUrl: string | null; createdAt: string;
  render: { step: RenderStep; attempt: number; failure: RenderFailure | null } | null;
  seconds: number | null; price: number | null; thumbUrl: string | null; videoUrl: string | null;
};
export type ChatTurn = { role: "user" | "assistant"; text: string; at: string; requestId?: string };
export type CheckResult = { check: string; status: "pass" | "warn" | "blocker"; note: string };
export type ReelDetail = {
  item: { id: string; title: string; status: ContentStatus; postUrl: string | null; scheduledFor: string | null };
  version: number; plan: ReelPlan | null; price: number | null;
  // The reel's and each scene's length in seconds, as the server prices them.
  seconds: number | null; sceneSeconds: number[];
  // "Made with AI." for a reel with a presenter or a cloned voice: shown under the caption, added when it's posted.
  aiDisclosure: string | null;
  caption: { caption?: string; hashtags?: string[] } | null; videoUrl: string | null;
  // The video's media key: the source a story frame uses for this reel.
  videoKey: string | null;
  checks: { overall: "PASS" | "WARN" | "BLOCKER"; results: CheckResult[] } | null;
  // softened: joins (scene n → n+1) the seam check turned into a dissolve because the two shots didn't match.
  // credits: what that attempt was charged (refunded if it failed); null when unknown.
  renders: { id: string; versionId: string; attempt: number; step: RenderStep; failure: RenderFailure | null; softened: number[]; videoKey: string | null; credits: number | null; createdAt: string }[];
  chat: ChatTurn[];
  credits: number;
  photoUrls: Record<string, string>;
};
/** droppedRecordings: scene numbers whose recording was dropped because their text changed. */
export type PlanResult = { version: number; plan: ReelPlan; price: number; reply?: string; droppedRecordings?: number[] };
/** Progress while a plan is written (apps/server/server/reels/service.ts PlanEvent). */
export type PlanStage = "reading" | "writing" | "directing";
export type DraftSoFar = { reply: string; title: string; scenes: { shot: string; voiceText: string }[] };
export type PlanEvent = { type: "stage"; stage: PlanStage } | ({ type: "draft" } & DraftSoFar);

export type ReelStage = "draft" | "processing" | "ready" | "failed";
// Mirrors mobile src/app/reels/index.tsx statusOf (+ "failed").
export function reelStage(r: Pick<ReelSummary, "render" | "videoUrl">): ReelStage {
  const step = r.render?.step;
  if (step === "VOICE" || step === "CLIPS" || step === "JOIN") return "processing";
  if (r.videoUrl) return "ready";
  return step === "FAILED" ? "failed" : "draft";
}

// Mirrors mobile review.tsx.
export const REEL_SENDABLE: readonly ContentStatus[] = ["AWAITING_APPROVAL", "APPROVED", "SCHEDULED", "PUBLISHED"];
export const REEL_SCHEDULABLE: readonly ContentStatus[] = ["AWAITING_APPROVAL", "APPROVED"];

export const isReelIdea = (o: { channels: readonly string[]; decision: string }) => o.channels.includes("INSTAGRAM_REEL") && o.decision !== "REJECT";

/** The assistant's reply to the person's turn sent with `requestId`, or null (not in the chat, or no reply after it yet). One rule for server and web. */
export function answeredTurn(chat: readonly ChatTurn[], requestId: string): string | null {
  // ponytail: the chat keeps its last 40 turns; a repeat whose turn was trimmed runs again.
  const i = chat.findIndex((t) => t.role === "user" && t.requestId === requestId);
  const next = i < 0 ? undefined : chat[i + 1];
  return next?.role === "assistant" ? next.text : null;
}
