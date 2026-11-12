import { z } from "zod";
import { MODEL_IDS, SCENE_KINDS, TRANSITIONS } from "@/server/reels/router";
import { CREDIT_COSTS } from "@/server/services/credits";

/**
 * A studio reel's plan (mobile R03/R04/R10–R13), stored as the content version body.
 * Scene lengths aren't chosen: they follow the voiceover, so the price matches what the render costs.
 */
export const ReelScene = z.object({
  photoKey: z.string().min(1).max(300),
  shot: z.string().max(80),
  direction: z.string().max(500),
  onScreenText: z.string().max(80),
  voiceText: z.string().min(1).max(400),
  // Set by the reel director: what kind of scene, the video model it routes to, and the prompt written for that model.
  kind: z.enum(SCENE_KINDS).optional(),
  model: z.enum(MODEL_IDS).optional(),
  prompt: z.string().max(1200).optional(),
  // Set by the director: how this scene hands over to the next one (the last scene's is ignored).
  transition: z.enum(TRANSITIONS).optional(),
  // The scriptwriter found no photo of what this scene talks about and used the closest one; it can't be rendered
  // until the scene gets another photo (R13). carryStandIns keeps it through edits and chat revisions.
  standIn: z.boolean().optional(),
  // The presenter speaks this scene on camera (R10): rendered on the presenter model, priced per presenter second.
  presenter: z.boolean().optional(),
  // A voiceover the person recorded for this scene (recordings.ts); its length, written by the server from the row.
  recordingId: z.string().max(100).optional(),
  recordingSeconds: z.number().min(0).max(16).optional(),
});
export const ReelPlan = z.object({
  title: z.string().min(1).max(120),
  presenter: z.string().min(1).max(100), // "none", or the id of one of the brand's presenters (presenters.ts)
  template: z.string().max(60),
  voice: z.string().min(1).max(100),
  // The voice's name, for showing it (a library voice's name isn't in our lists); never used to pick the voice.
  voiceName: z.string().max(80).optional(),
  // The reel's own language (voiceover, on-screen text, caption): the brand's by default, or what the person asked for.
  language: z.string().regex(/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/).optional(),
  scenes: z.array(ReelScene).min(2).max(6), // the reel rule needs a script of at least two beats
  caption: z.string().max(2200),
  hashtags: z.array(z.string().max(100)).max(5),
});
export type ReelScene = z.infer<typeof ReelScene>;
export type ReelPlan = z.infer<typeof ReelPlan>;

const WORDS_PER_SECOND = 2; // R11: "38 words · ~19 sec"
export const MAX_SCENE_WORDS = 30; // 15 s, the longest clip Kling makes

const wordCount = (text: string) => text.trim().split(/\s+/).filter(Boolean).length;
export const speechSeconds = (text: string) => wordCount(text) / WORDS_PER_SECOND;
export const clipSeconds = (voiceSeconds: number) => Math.min(15, Math.max(3, Math.ceil(voiceSeconds)));
/** The presenter model's shortest clip (Seedance): a presenter scene is never shorter, and is priced for it. */
export const PRESENTER_MIN_SECONDS = 4;
/** A scene lasts as long as its voice: the recording's measured length, else the script read at ~2 words a second. */
export const sceneSeconds = (scene: Pick<ReelScene, "voiceText" | "presenter" | "recordingId" | "recordingSeconds">) => {
  const s = clipSeconds(scene.recordingId && scene.recordingSeconds !== undefined ? scene.recordingSeconds : speechSeconds(scene.voiceText));
  return scene.presenter ? Math.max(PRESENTER_MIN_SECONDS, s) : s;
};
export const reelSeconds = (plan: ReelPlan) => plan.scenes.reduce((sum, s) => sum + sceneSeconds(s), 0);
export const reelPrice = (plan: ReelPlan) =>
  plan.scenes.reduce((sum, s) => sum + sceneSeconds(s) * (s.presenter ? CREDIT_COSTS.presenterPerSecond : CREDIT_COSTS.reelPerSecond), 0);


const PHOTO_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|png)$/;

/** What stops this plan from being rendered, in words a person can act on. Empty = fine. */
export function planProblems(plan: ReelPlan, scope: { workspaceId: string; brandId: string }): string[] {
  const prefix = `${scope.workspaceId}/${scope.brandId}/`;
  return plan.scenes.flatMap((s, i) => {
    const out: string[] = [];
    const file = s.photoKey.slice(prefix.length);
    if (!s.photoKey.startsWith(prefix) || !PHOTO_FILE.test(file) || file.includes("..")) out.push(`Scene ${i + 1} uses a photo this brand doesn't have.`);
    // A recorded scene's length is measured (at most 15 s on upload), so the word rule doesn't apply to it.
    if (!s.recordingId && wordCount(s.voiceText) > MAX_SCENE_WORDS) out.push(`Scene ${i + 1}'s voiceover runs ~${Math.round(speechSeconds(s.voiceText))} s; keep it under ${MAX_SCENE_WORDS} words (15 s).`);
    if (s.presenter && s.standIn) out.push(`Scene ${i + 1} can't have the presenter: its photo doesn't show what it talks about.`);
    return out;
  }).concat(presenterProblems(plan));
}

/** Presenter scenes only with a presenter picked, and at most half the reel (the product stays the subject). */
function presenterProblems(plan: ReelPlan): string[] {
  const n = plan.scenes.filter((s) => s.presenter).length;
  if (!n) return [];
  if (plan.presenter === "none") return ["Pick a presenter before giving scenes to one."];
  const max = Math.floor(plan.scenes.length / 2);
  return n > max ? [`The presenter can speak in at most ${max} of the ${plan.scenes.length} scenes.`] : [];
}

/** With no presenter, no scene is a presenter scene ("No presenter" clears the flags). */
export const clearPresenterFlags = (plan: ReelPlan): ReelPlan =>
  plan.presenter === "none" ? { ...plan, scenes: plan.scenes.map((s) => ({ ...s, presenter: undefined })) } : plan;

/** Every join in a reel with a presenter is a cut: a dissolve between a face and a product reads as a glitch. */
export const presenterCuts = (plan: ReelPlan): ReelPlan =>
  plan.presenter === "none" ? plan : { ...plan, scenes: plan.scenes.map((s) => ({ ...s, transition: s.transition && "cut" })) };

/** Scenes whose photo shows something else than the scene talks about: rendering them would misrepresent the product. */
export const standInProblems = (plan: ReelPlan) =>
  plan.scenes.flatMap((s, i) => (s.standIn ? [`Scene ${i + 1}'s photo doesn't show what it talks about. Pick its photo in Select assets, or ask the chat to change the scene.`] : []));

/**
 * An edit can't clear a stand-in: a photo flagged in the previous version stays flagged wherever it's used (moved,
 * reordered or kept), until it's replaced (R13). `fromScriptwriter` also keeps the new plan's own flags (a chat
 * revision); a person's edit from the app passes false, so the app's value is ignored.
 */
export const carryStandIns = (plan: ReelPlan, previous: ReelPlan | undefined, fromScriptwriter: boolean): ReelPlan => {
  const flagged = new Set(previous?.scenes.filter((s) => s.standIn).map((s) => s.photoKey));
  return { ...plan, scenes: plan.scenes.map((s) => ({ ...s, standIn: (fromScriptwriter && s.standIn) || flagged.has(s.photoKey) ? true : undefined })) };
};

/**
 * EU AI Act transparency (Art. 50): a reel showing an AI presenter or speaking with a cloned voice says it's made
 * with AI, in its caption (added at publishing, shown to approvers) and as a small mark in the video (render.ts).
 */
/** The line in the reel's own language (its viewers read it); English for the rest. */
const AI_LINES: Record<string, string> = { en: "Made with AI.", fr: "Créé avec l'IA.", de: "Mit KI erstellt.", es: "Creado con IA.", it: "Creato con l'IA.", pt: "Criado com IA.", nl: "Gemaakt met AI." };
export const aiDisclosureLine = (language?: string) => AI_LINES[(language ?? "en").split("-")[0]] ?? AI_LINES.en;
export const needsAiDisclosure = (plan: { presenter?: string; voice?: string }) => (!!plan.presenter && plan.presenter !== "none") || !!plan.voice?.startsWith("clone:");

/** The version body: the plan, plus the fields the shared content rules and publisher read. */
export const toVersionBody = (plan: ReelPlan) => ({
  ...plan,
  aiDisclosure: needsAiDisclosure(plan),
  hook: plan.scenes[0].onScreenText,
  script: plan.scenes.map((s) => s.voiceText),
  slides: [] as string[],
  pinTitle: "",
  altText: "",
});

/** "en" → "English": models are told languages by name. */
export const languageName = (code: string) => {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
};

export const isStudioPlan = (body: unknown): body is ReelPlan => ReelPlan.safeParse(body).success;
