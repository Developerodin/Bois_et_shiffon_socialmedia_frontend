import { z } from "zod";
import { MODEL_IDS, SCENE_KINDS } from "@/server/reels/router";
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
});
export const ReelPlan = z.object({
  title: z.string().min(1).max(120),
  presenter: z.literal("none"), // presenters that speak on camera come later
  template: z.string().max(60),
  voice: z.string().min(1).max(100),
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
export const sceneSeconds = (scene: Pick<ReelScene, "voiceText">) => clipSeconds(speechSeconds(scene.voiceText));
export const reelSeconds = (plan: ReelPlan) => plan.scenes.reduce((sum, s) => sum + sceneSeconds(s), 0);
export const reelPrice = (plan: ReelPlan) => reelSeconds(plan) * CREDIT_COSTS.reelPerSecond;

const PHOTO_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(jpg|png)$/;

/** What stops this plan from being rendered, in words a person can act on. Empty = fine. */
export function planProblems(plan: ReelPlan, scope: { workspaceId: string; brandId: string }): string[] {
  const prefix = `${scope.workspaceId}/${scope.brandId}/`;
  return plan.scenes.flatMap((s, i) => {
    const out: string[] = [];
    const file = s.photoKey.slice(prefix.length);
    if (!s.photoKey.startsWith(prefix) || !PHOTO_FILE.test(file) || file.includes("..")) out.push(`Scene ${i + 1} uses a photo this brand doesn't have.`);
    if (wordCount(s.voiceText) > MAX_SCENE_WORDS) out.push(`Scene ${i + 1}'s voiceover runs ~${Math.round(speechSeconds(s.voiceText))} s; keep it under ${MAX_SCENE_WORDS} words (15 s).`);
    return out;
  });
}

/** The version body: the plan, plus the fields the shared content rules and publisher read. */
export const toVersionBody = (plan: ReelPlan) => ({
  ...plan,
  hook: plan.scenes[0].onScreenText,
  script: plan.scenes.map((s) => s.voiceText),
  slides: [] as string[],
  pinTitle: "",
  altText: "",
});

export const isStudioPlan = (body: unknown): body is ReelPlan => ReelPlan.safeParse(body).success;
