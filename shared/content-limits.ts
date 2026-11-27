import { safeHttpUrl } from "./website";

/**
 * Caption and hashtag limits for post text; server/content/rules.ts, the reel plan (server/reels/plan.ts), the content
 * route's studio-reel guard (publishing.ts saveDraft), the web draft editor and the reel Review step all read these.
 * hashtagLengthMax: one hashtag's characters, with its #.
 */
export const CAPTION_LIMITS = { captionMax: 2200, previewChars: 125, hashtagsMax: 5, hashtagLengthMax: 100, pinTitleMax: 100, pinDescriptionMax: 500, threadsMax: 500, linkedinMax: 3000, xMax: 280 } as const;
/**
 * Per-channel text limits, the one list for server/content/rules.ts, the publish check (server/services/publishing.ts)
 * and the web draft editor; each says what it counts (caption, or caption plus hashtags). Unlisted: captionMax applies in
 * rules.ts and the editor, nothing at publish.
 */
export const CHANNEL_TEXT_MAX = {
  INSTAGRAM_POST: CAPTION_LIMITS.captionMax, INSTAGRAM_CAROUSEL: CAPTION_LIMITS.captionMax, INSTAGRAM_REEL: CAPTION_LIMITS.captionMax,
  THREADS_POST: CAPTION_LIMITS.threadsMax, LINKEDIN_POST: CAPTION_LIMITS.linkedinMax, X_POST: CAPTION_LIMITS.xMax,
} as const;

/**
 * How many images each channel publishes [min, max] (server/services/publishing.ts checks it when scheduling; New post
 * and the Creator keep to it). Reels take a video instead; a story posts its frames (publishRequirements).
 */
export const CHANNEL_IMAGES = {
  INSTAGRAM_POST: [1, 1], PINTEREST_PIN: [1, 1], INSTAGRAM_CAROUSEL: [2, 10],
  FACEBOOK_POST: [0, 1], THREADS_POST: [0, 1], LINKEDIN_POST: [0, 1], X_POST: [0, 1],
  INSTAGRAM_REEL: [0, 0], INSTAGRAM_STORY: [0, 0],
} as const satisfies Record<string, readonly [number, number]>;

/** The most characters a channel's caption (a pin's description) takes, as the draft editor and New post count it. */
export function captionMaxFor(channel: string): number {
  if (channel === "PINTEREST_PIN") return CAPTION_LIMITS.pinDescriptionMax;
  return (CHANNEL_TEXT_MAX as Record<string, number>)[channel] ?? CAPTION_LIMITS.captionMax;
}

/** A pin's destination as the person typed it: https only, no credentials, at most 2000 characters; kept as URL.href. Null when it isn't one. */
export function cleanPinLink(raw: string): string | null {
  const t = raw.trim();
  if (t.length > 2000) return null;
  const u = safeHttpUrl(t);
  return u && u.protocol === "https:" && !u.username && !u.password ? u.href : null;
}

/** New post drafts these with the Creator from a product photo (the server's NewPostInput). */
export const AI_POST_CHANNELS = ["INSTAGRAM_POST", "INSTAGRAM_CAROUSEL"] as const;
/** New post takes these as the person writes them (the server's WrittenPostInput). LinkedIn and X are posted by hand. */
export const WRITTEN_POST_CHANNELS = ["FACEBOOK_POST", "PINTEREST_PIN", "THREADS_POST", "LINKEDIN_POST", "X_POST"] as const;
export type WrittenPostChannel = (typeof WRITTEN_POST_CHANNELS)[number];
/** Every channel New post makes (one request-id space: a retry finds its post whatever the channel). */
export const NEW_POST_CHANNELS = [...AI_POST_CHANNELS, ...WRITTEN_POST_CHANNELS] as const;

/**
 * Why a written post can't be made as it stands, or null. The server refuses with this message and the web shows it
 * before sending. `photos`: how many images it carries. Text is counted trimmed, as it is saved and posted.
 */
export function writtenPostProblem(channel: WrittenPostChannel, post: { text: string; pinTitle?: string; pinLink?: string; photos: number }): string | null {
  const pin = channel === "PINTEREST_PIN";
  const text = post.text.trim();
  const max = captionMaxFor(channel);
  if (pin && !post.pinTitle?.trim()) return "Give the pin a title.";
  if (pin && post.pinTitle!.trim().length > CAPTION_LIMITS.pinTitleMax) return `The pin title takes ${CAPTION_LIMITS.pinTitleMax} characters at most.`;
  if (!text) return pin ? "Write the pin's description." : "Write the post first.";
  if (text.length > max) return `${pin ? "The description" : "The text"} takes ${max} characters at most.`;
  if (pin && post.pinLink?.trim() && !cleanPinLink(post.pinLink)) return "The pin's link must be a full https:// address (no password in it, 2000 characters at most).";
  const [min, most] = CHANNEL_IMAGES[channel];
  if (post.photos < min) return "Choose the pin's image.";
  if (post.photos > most) return `This channel takes ${most} image at most.`;
  return null;
}
