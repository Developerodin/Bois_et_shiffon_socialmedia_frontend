import { z } from "zod";
import { PublishingError } from "@/server/services/publishing";

export const STORY_LIMITS = { frames: [3, 5], maxFrames: 5, label: 30, headline: 60, body: 120, cta: 40, clipSeconds: 15, link: 2000 } as const;

export type SourceRef = { kind: "upload" | "library" | "product" | "post" | "photoshoot" | "reel"; id: string };
export type StoryFrameInput = {
  source?: SourceRef; label: string; headline: string; body: string; composition?: string;
  crop?: { x: number; y: number; scale: number }; clip?: { start: number; sound: boolean };
};
export type FrameFile = { width: number; height: number; bytes: number; durationSec?: number };
export type StoryFrame = StoryFrameInput & {
  mediaKey?: string; mediaKind?: "photo" | "video"; renderedKey?: string; aiMark?: boolean;
  rights?: { kind: "owned" } | { kind: "confirmed"; by: string; name: string }; file?: FrameFile;
};
export type StoryBody = { frames: StoryFrame[]; cta: string; link: string; hook: string; productIds: string[]; brandMark: boolean };
export type StoryInput = { frames: StoryFrameInput[]; cta: string; link: string; brandMark: boolean };

// Only the client-settable fields are listed; .strip() drops mediaKey, renderedKey, aiMark, rights, file.
const frameSchema = z.object({
  source: z.object({ kind: z.enum(["upload", "library", "product", "post", "photoshoot", "reel"]), id: z.string().min(1).max(200) }).strip().optional(),
  label: z.string().max(STORY_LIMITS.label),
  headline: z.string().max(STORY_LIMITS.headline),
  body: z.string().max(STORY_LIMITS.body),
  composition: z.string().max(100).optional(),
  crop: z.object({ x: z.number().finite(), y: z.number().finite(), scale: z.number().finite().positive() }).strip().optional(),
  clip: z.object({ start: z.number().finite().min(0), sound: z.boolean() }).strip().optional(),
}).strip();

const httpsLink = z.string().max(STORY_LIMITS.link).refine((v) => {
  if (v === "") return true;
  try { return new URL(v).protocol === "https:"; } catch { return false; }
}, "link must be an https URL");

const inputSchema = z.object({
  frames: z.array(frameSchema).max(STORY_LIMITS.maxFrames),
  cta: z.string().max(STORY_LIMITS.cta),
  link: httpsLink,
  brandMark: z.boolean(),
}).strip();

export function parseStoryInput(raw: unknown): StoryInput {
  const r = inputSchema.safeParse(raw);
  if (!r.success) {
    const i = r.error.issues[0];
    throw new PublishingError(`${i.path.join(".") || "story"}: ${i.message}`, 400, "story.invalid");
  }
  return r.data as StoryInput;
}

export function storySlides(body: Pick<StoryBody, "frames" | "cta">): string[] {
  const frames = body.frames.map((f) => [f.label, f.headline, f.body].filter(Boolean).join("\n"));
  return [...frames, body.cta].filter(Boolean);
}

export function isStoryBody(x: unknown): x is StoryBody {
  if (!x || typeof x !== "object") return false;
  const b = x as Record<string, unknown>;
  return Array.isArray(b.frames) && typeof b.cta === "string" && typeof b.link === "string" && typeof b.hook === "string"
    && Array.isArray(b.productIds) && typeof b.brandMark === "boolean";
}
