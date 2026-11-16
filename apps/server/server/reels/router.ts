/**
 * Which Higgsfield video model makes each reel scene. The director AI only says what kind of scene it is;
 * the choice is this table, from Higgsfield's own model guidance (higgsfield-ai/skills, MIT):
 * Kling 3.0 is the "lower-cost option for single-plane scenes that don't need heavy motion",
 * Seedance 2.5 "the default for serious motion, cinematic" briefs, MiniMax Hailuo "cheap with strong physics".
 * ponytail: a code table; move it to the database next to AiTier if admins need to change it without a deploy.
 */
export type SceneKind = "detail" | "room" | "physics";
/**
 * How a scene hands over to the next (the director picks; the seam check can soften it):
 * match = it ends on the framing the next starts from (a cut that feels continuous), cut = a deliberate cut on the
 * voice's beat between views of the same subject, dissolve = a soft blend where place, light or distance changes.
 */
export const TRANSITIONS = ["cut", "match", "dissolve"] as const;
export type Transition = (typeof TRANSITIONS)[number];
export const SCENE_KINDS = ["detail", "room", "physics"] as const satisfies readonly SceneKind[];

/** imageUrls/audioUrl: the presenter model's references (presenter sheet, product photo) and the scene's voice. */
type ClipInput = { photoUrl: string; prompt: string; seconds: number; imageUrls?: string[]; audioUrl?: string };
type VideoModel = { path: string; minSeconds: number; maxSeconds: number; allowed?: number[]; body: (input: ClipInput) => Record<string, unknown> };

export const VIDEO_MODELS = {
  "kling-3-std": {
    path: "/kling-video/v3.0/std/image-to-video",
    minSeconds: 3,
    maxSeconds: 15,
    body: (i: ClipInput) => ({ image_url: i.photoUrl, prompt: i.prompt, duration: i.seconds, sound: "off" }),
  },
  "seedance-2.5": {
    path: "/bytedance/seedance-2.5/image-to-video",
    minSeconds: 4,
    maxSeconds: 30,
    body: (i: ClipInput) => ({ image_url: i.photoUrl, prompt: i.prompt, duration: i.seconds, resolution: "1080p", generate_audio: false }),
  },
  "hailuo-2.3": {
    path: "/minimax/hailuo-2.3/standard/image-to-video",
    minSeconds: 6,
    maxSeconds: 10,
    allowed: [6, 10],
    body: (i: ClipInput) => ({ image_url: i.photoUrl, prompt: i.prompt, duration: i.seconds }),
  },
  // Presenter scenes (R10): the presenter speaks the scene's voice, lip-synced, next to the product. Never routed by
  // the director, never a backup: render.ts picks it by scene.presenter. Body beyond audio_urls is a guess until the
  // first live run (POST {} answered "'audio_urls' is a required property", 2026-11-12).
  "seedance-2.5-ref": {
    path: "/bytedance/seedance-2.5/reference-to-video",
    minSeconds: 4,
    maxSeconds: 15,
    body: (i: ClipInput) => ({ image_urls: i.imageUrls ?? [i.photoUrl], audio_urls: i.audioUrl ? [i.audioUrl] : [], prompt: i.prompt, duration: i.seconds, resolution: "1080p" }),
  },
} satisfies Record<string, VideoModel>;
export type ModelId = keyof typeof VIDEO_MODELS;
export const PRESENTER_MODEL: ModelId = "seedance-2.5-ref";
/** The models a plan may name (the director's routes); the presenter model is the render's own choice. */
export const MODEL_IDS = (Object.keys(VIDEO_MODELS) as ModelId[]).filter((m) => m !== PRESENTER_MODEL) as [ModelId, ...ModelId[]];

const ROUTES: Record<SceneKind, ModelId> = { detail: "kling-3-std", room: "seedance-2.5", physics: "hailuo-2.3" };
/** Used when a scene's model refuses or fails: the cheapest, most predictable one. */
export const BACKUP_MODEL: ModelId = "kling-3-std";

export const routeScene = (kind: SceneKind): ModelId => ROUTES[kind];
export const isModelId = (v: unknown): v is ModelId => typeof v === "string" && v in VIDEO_MODELS;

/** The clip length to ask for: the voice's length rounded up, kept inside what the model accepts. */
export function modelSeconds(model: ModelId, voiceSeconds: number): number {
  const m: VideoModel = VIDEO_MODELS[model];
  const want = Math.ceil(voiceSeconds);
  if (m.allowed) return m.allowed.find((s) => s >= want) ?? m.allowed[m.allowed.length - 1];
  return Math.min(m.maxSeconds, Math.max(m.minSeconds, want));
}

/** Copy-joining needs identical clips at their exact scene length and plain cuts; anything else is re-encoded. */
export function needsReencode(clips: { model: ModelId; clip: number; scene: number; transition?: Transition }[]) {
  return new Set(clips.map((c) => c.model)).size > 1 || clips.some((c) => c.clip !== c.scene || c.transition === "dissolve");
}
