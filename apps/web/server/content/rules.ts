import type { ContentChannel } from "@prisma/client";

/**
 * Deterministic content checks (no AI): same draft in → same result out.
 * Caption shape and hashtag rules adapted from instagram-agent-skill ig-caption / ig-human (MIT, see NOTICE.md);
 * the French phrase list is ours.
 */
export type DraftBody = {
  hook: string;
  caption: string;
  hashtags: string[];
  slides?: string[];
  script?: string[];
  pinTitle?: string;
  altText?: string;
};
export type CheckStatus = "pass" | "warn" | "blocker";
export type CheckResult = { check: string; status: CheckStatus; note: string };

export const LIMITS = { captionMax: 2200, previewChars: 125, hashtagsMax: 5, pinTitleMax: 100, threadsMax: 500 };

/** Phrases that read as AI-written marketing filler, in French and English. Lower-case. */
export const SLOP = [
  // French
  "dans un monde où", "plongez dans", "n'hésitez pas à", "sans plus attendre", "à couper le souffle", "un véritable voyage",
  "sublimer votre intérieur", "élégance intemporelle", "alliance parfaite", "véritable havre de paix", "laissez-vous séduire",
  "découvrez dès maintenant", "incontournable", "révolutionner", "il est important de noter",
  // English (subset of ig-human slop.json)
  "delve", "in today's fast-paced world", "elevate your", "game-changer", "unlock the", "seamless", "look no further",
];

const CTA = /\b(commentez|commente|enregistrez|enregistre|partagez|découvrez|découvre|écrivez|écris|dm|cliquez|lien en bio|shop|comment|save|share|tap|link in bio|réservez|visitez)\b/gi;

export function checkDraft(channel: ContentChannel, body: DraftBody): CheckResult[] {
  const out: CheckResult[] = [];
  const add = (check: string, status: CheckStatus, note: string) => out.push({ check, status, note });
  const caption = body.caption.trim();
  const firstLine = caption.split("\n")[0] ?? "";
  const text = `${body.hook}\n${caption}\n${(body.slides ?? []).join("\n")}\n${(body.script ?? []).join("\n")}`.toLowerCase();

  if (!caption) add("Caption", "blocker", "The caption is empty.");
  else if (caption.length > LIMITS.captionMax) add("Caption length", "blocker", `${caption.length} characters; the limit is ${LIMITS.captionMax}.`);

  if (channel.startsWith("INSTAGRAM") && caption) {
    if (/^[#@]|^\p{Extended_Pictographic}/u.test(firstLine)) add("First line", "warn", "Starts with a hashtag, mention or emoji; lead with words.");
    if (firstLine.length > LIMITS.previewChars) add("First line", "warn", `${firstLine.length} characters; only the first ${LIMITS.previewChars} show before "more".`);
  }
  if (body.hashtags.length > LIMITS.hashtagsMax) {
    add("Hashtags", channel.startsWith("INSTAGRAM") ? "blocker" : "warn", `${body.hashtags.length} hashtags; Instagram allows ${LIMITS.hashtagsMax} since Dec 2025, and they are labels, not reach.`);
  }

  const asks = new Set((caption.match(CTA) ?? []).map((m) => m.toLowerCase())).size;
  if (asks === 0) add("Call to action", "warn", "No clear ask (comment, save, share, visit…).");
  else if (asks > 2) add("Call to action", "warn", `${asks} different asks; keep one.`);

  const slop = SLOP.filter((p) => text.includes(p));
  if (slop.length) add("Sounds AI-written", slop.length > 2 ? "blocker" : "warn", `Rewrite: ${slop.map((s) => `"${s}"`).join(", ")}.`);

  if (channel === "PINTEREST_PIN") {
    if (!body.pinTitle?.trim()) add("Pin title", "blocker", "Pins need a title.");
    else if (body.pinTitle.length > LIMITS.pinTitleMax) add("Pin title", "warn", `${body.pinTitle.length} characters; keep it under ${LIMITS.pinTitleMax}.`);
  }
  if (channel === "THREADS_POST" && caption.length > LIMITS.threadsMax) add("Threads length", "blocker", `${caption.length} characters; Threads allows ${LIMITS.threadsMax}.`);
  if (channel === "INSTAGRAM_CAROUSEL" && (body.slides?.length ?? 0) < 3) add("Carousel", "blocker", "A carousel needs at least 3 slides.");
  if (channel === "INSTAGRAM_REEL" && (body.script?.length ?? 0) < 2) add("Reel script", "blocker", "A Reel needs a beat-by-beat script.");
  if (!body.altText?.trim() && channel !== "THREADS_POST") add("Alt text", "warn", "Describe the image for screen readers and search.");

  return out;
}

export const overallOf = (results: CheckResult[]): "PASS" | "WARN" | "BLOCKER" =>
  results.some((r) => r.status === "blocker") ? "BLOCKER" : results.some((r) => r.status === "warn") ? "WARN" : "PASS";
