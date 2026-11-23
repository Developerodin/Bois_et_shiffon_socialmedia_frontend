/**
 * Caption and hashtag limits for post text; server/content/rules.ts, the reel plan (server/reels/plan.ts), the content
 * route's studio-reel guard (publishing.ts saveDraft), the web draft editor and the reel Review step all read these.
 * hashtagLengthMax: one hashtag's characters, with its #.
 */
export const CAPTION_LIMITS = { captionMax: 2200, previewChars: 125, hashtagsMax: 5, hashtagLengthMax: 100, pinTitleMax: 100, threadsMax: 500, linkedinMax: 3000, xMax: 280 } as const;
