import { LIBRARY_FILTERS, type ReelPlan, type CloningInfo, type LibraryFilters, type LibraryVoice, type ReelVoiceOption } from "@/shared";
import { ApiError } from "@/components/settings/api";

// The phone's English (mobile src/i18n/locales/en/reels.json): keep the words in step. Kept out of labels.ts, which every reel page loads.

/** The presenter builder's trait group titles (actor.trait.*); the options' words come from the server. */
export const TRAIT_TITLES: Record<string, string> = {
  gender: "Gender",
  age: "Age",
  ethnicity_origin_base: "Ethnicity",
  skin_tone: "Skin tone",
  hair: "Hair",
  hair_colour: "Hair colour",
  aesthetic: "Style",
};

export const GENDER_LABELS: Record<ReelVoiceOption["gender"], string> = { female: "Female voice", male: "Male voice", neutral: "Neutral voice", clone: "Cloned voice" };

/** The library filters' option words. Languages are named by languageName. */
export const LIBRARY_LABELS: { [K in keyof typeof LIBRARY_FILTERS]?: Record<(typeof LIBRARY_FILTERS)[K][number], string> } = {
  gender: { female: "Female", male: "Male", neutral: "Neutral" },
  age: { young: "Young", middle_aged: "Middle-aged", old: "Older" },
  useCase: {
    social_media: "Social media",
    advertisement: "Advertising",
    narrative_story: "Storytelling",
    conversational: "Conversational",
    informative_educational: "Educational",
    characters_animation: "Characters & animation",
  },
};

export const LIBRARY_TITLES: Record<keyof typeof LIBRARY_FILTERS, string> = { language: "Language", gender: "Gender", age: "Age", useCase: "Use" };

/** The library request's query string: set, non-empty fields; page only from 1. */
export function libraryQuery(f: LibraryFilters): string {
  const q = new URLSearchParams();
  for (const k of ["language", "gender", "age", "useCase", "search"] as const) if (f[k]) q.set(k, f[k]);
  if (f.page && f.page > 0) q.set("page", String(f.page));
  return q.toString();
}

/** `prev`, then those of `next` whose id isn't in it yet, nor earlier in `next` (pages can overlap). */
export function mergeLibraryPage(prev: LibraryVoice[], next: LibraryVoice[]): LibraryVoice[] {
  const seen = new Set(prev.map((v) => v.id));
  return [...prev, ...next.filter((v) => !seen.has(v.id) && seen.add(v.id))];
}

/** The library's language to start on: the reel's base language ("pt-BR" gives "pt") when the library has it, else "" (Any). */
export function defaultLibraryLanguage(planLanguage: string | undefined): string {
  const base = planLanguage?.split("-")[0] ?? "";
  return (LIBRARY_FILTERS.language as readonly string[]).includes(base) ? base : "";
}

/** Whether the library's filters are anything beyond their start (the default language, nothing else): then Clear shows. */
export function libraryNarrowed(f: { language: string; gender: string; age: string; useCase: string; search: string }, defaultLanguage: string): boolean {
  return !!(f.gender || f.age || f.useCase || f.search || f.language !== defaultLanguage);
}

/** An aborted request: `request` rethrows it as is, and it is never a failure to show. */
export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

/**
 * Whether a failed clone press may reuse its recording take. Only when there was no answer (status 0) or the server says
 * the voice is still being made (the repeat branch, which runs before the challenge). Any other answer, 5xx included,
 * already used the challenge (clones.ts takes it before its checks; a 502 refunded the id), so the next press records anew.
 * The phone's rule (mobile clone.tsx).
 */
export const cloneRetry = (e: unknown): "same-take" | "new-take" =>
  e instanceof ApiError && (e.status === 0 || e.code === "clone.stillMaking") ? "same-take" : "new-take";

/** The first preferred language the list has: exact, then its base ("pt-BR" gives "pt"); else English. */
export function readingLanguage(preferred: readonly string[], available: readonly string[]): string {
  for (const p of preferred) {
    if (available.includes(p)) return p;
    const base = p.split("-")[0]!;
    if (available.includes(base)) return base;
  }
  return "en";
}

/** How long a clone challenge lives on the server (apps/server/server/reels/clone-challenge.ts CHALLENGE_TTL_MS). */
export const CHALLENGE_TTL_MS = 600_000;

/** A clone challenge read for `lang` at `at`; `used` once a clone was sent with it (the server takes it on any answer). */
export type ChallengeEntry = { lang: string; challenge: { challengeId: string; lang: string; sentences: string[] }; at: number; used?: boolean };

/** The kept challenge, if reopening the dialog may show it again: same language, never sent, and under its 10 minutes. */
export const reusableChallenge = (e: ChallengeEntry | null, lang: string, now: number): ChallengeEntry | null =>
  e && !e.used && e.lang === lang && now - e.at < CHALLENGE_TTL_MS ? e : null;

/** Whether a reading may start on this challenge: never sent, and at most half its life gone (else read a new one first). */
export const readableChallenge = (e: ChallengeEntry | null, now: number): e is ChallengeEntry =>
  !!e && !e.used && now - e.at <= CHALLENGE_TTL_MS / 2;

/** "fr" as "French" (one helper, in shared/). */
export { languageName } from "@/shared";

/** Whether the person may rename or delete this voice: a clone that is theirs, or any clone when cloning is allowed to them. */
export const canManageClone = (v: ReelVoiceOption, cloning: CloningInfo | null): boolean => v.clone && (v.mine || !!cloning?.allowed);

/** How long a library read waits: the first read, Search, Clear and Try again go at once; a select change waits for the next one. */
export const LIBRARY_WAIT_MS = 300;
export const libraryWait = (immediate: boolean): number => (immediate ? 0 : LIBRARY_WAIT_MS);

/** Whether `mine` is still the newest request (a newer one, or a filter change, replaced it): only then may its answer land. */
export const isLatest = <T>(latest: T | null, mine: T): boolean => latest === mine;

/** Whether a failed library read is shown: only the newest request's, and never an abort. */
export const showLibraryError = <T>(latest: T | null, mine: T, e: unknown): boolean => isLatest(latest, mine) && !isAbort(e);

/** The page More voices asks for: the one after the last shown (a new set of filters always starts at 0). */
export const nextLibraryPage = (shown: { page: number } | null): number => (shown ? shown.page + 1 : 0);

/** The plan Use this voice saves: the chosen voice, its name capped as plan.ts caps it (library names aren't checked). */
export const planWithVoice = (plan: ReelPlan, voice: { id: string; name: string }): ReelPlan => ({ ...plan, voice: voice.id, voiceName: voice.name.slice(0, 80) });
