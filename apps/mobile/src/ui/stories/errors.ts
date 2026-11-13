import { ApiError } from "@/api/client";
import i18n from "@/i18n";

/**
 * A story refusal in the app's words: the server's stable code ("story.credits") maps to posts:stories.errors.credits,
 * with the server's English text as the fallback for codes the app has no string for yet. Extra fields the server sends with a refusal (e.g. expiredFrames) fill the string's placeholders.
 */
export function storyError(e: unknown): string {
  if (!(e instanceof ApiError)) return e instanceof Error ? e.message : String(e);
  const key = e.code?.startsWith("story.") ? e.code.slice("story.".length) : null;
  if (!key) return e.message;
  const data = (e.data && typeof e.data === "object" ? e.data : {}) as Record<string, unknown>;
  return i18n.t(`posts:stories.errors.${key}`, { ...data, defaultValue: e.message });
}
