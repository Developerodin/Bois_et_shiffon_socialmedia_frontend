/**
 * The languages a business can choose: the post language (what customers read; BrandProfile.locales[0]) and the team
 * working language (what agents write for the team; preferences.workLanguage). One list for both.
 */
export const CONTENT_LANGUAGES = ["fr", "en"] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];
export const isContentLanguage = (v: unknown): v is ContentLanguage => (CONTENT_LANGUAGES as readonly unknown[]).includes(v);

/** "fr" → "French": models and people are told languages by name. The code itself if the runtime can't name it. */
export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(["en"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

/** A business's two languages; null = not chosen yet. */
export type BrandLanguages = { workLanguage: ContentLanguage | null; contentLanguage: ContentLanguage | null };
