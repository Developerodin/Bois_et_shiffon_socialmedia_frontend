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
