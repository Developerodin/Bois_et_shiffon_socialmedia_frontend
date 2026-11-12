import { z } from "zod";
import { prisma } from "@/server/db/prisma";

/**
 * ElevenLabs' public Voice Library (mobile Voices → Library): thousands of voices people can filter by language,
 * gender, age, accent and use case, and preview. In a plan a library voice is "library:<voiceId>". Speaking with one
 * needs ElevenLabs' paid plan (the free plan answers 402 paid_plan_required, checked 2026-11-12): until then a render
 * with one is refused before charging, with its own message.
 */
const EL = "https://api.elevenlabs.io/v1";
const PAGE = 30;
/** Library ids are ElevenLabs voice ids: 20 letters and digits. */
const VOICE_ID = /^[A-Za-z0-9]{20}$/;

export const LibraryQuery = z.object({
  language: z.string().regex(/^[a-z]{2}$/).optional(),
  gender: z.enum(["female", "male", "neutral"]).optional(),
  age: z.enum(["young", "middle_aged", "old"]).optional(),
  accent: z.string().trim().max(40).optional(),
  useCase: z.enum(["social_media", "narrative_story", "advertisement", "conversational", "informative_educational", "characters_animation"]).optional(),
  search: z.string().trim().max(60).optional(),
  page: z.coerce.number().int().min(0).max(50).default(0),
});
export type LibraryQuery = z.infer<typeof LibraryQuery>;

export type LibraryVoice = { id: string; name: string; gender: string | null; age: string | null; accent: string | null; language: string | null; useCase: string | null; previewUrl: string | null };

// ponytail: the library changes slowly: a page is kept 10 minutes per query, in this process only.
const cache = new Map<string, { at: number; value: { voices: LibraryVoice[]; more: boolean } }>();

export async function searchLibrary(q: LibraryQuery) {
  const key = JSON.stringify(q);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("The voice library isn't set up on this server (ELEVENLABS_API_KEY is missing).");
  const params = new URLSearchParams({ page_size: String(PAGE), page: String(q.page) });
  if (q.language) params.set("language", q.language);
  if (q.gender) params.set("gender", q.gender);
  if (q.age) params.set("age", q.age);
  if (q.accent) params.set("accent", q.accent);
  if (q.useCase) params.set("use_cases", q.useCase);
  if (q.search) params.set("search", q.search);
  const res = await fetch(`${EL}/shared-voices?${params}`, { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: the voice library didn't answer`);
  const data = (await res.json()) as { voices?: Record<string, unknown>[]; has_more?: boolean };
  const text = (v: unknown) => (typeof v === "string" && v ? v : null);
  const voices = (data.voices ?? [])
    .filter((v) => typeof v.voice_id === "string" && VOICE_ID.test(v.voice_id))
    .map((v) => ({ id: `library:${v.voice_id}`, name: text(v.name) ?? "Voice", gender: text(v.gender), age: text(v.age), accent: text(v.accent), language: text(v.language), useCase: text(v.use_case), previewUrl: text(v.preview_url) }));
  const value = { voices, more: !!data.has_more };
  cache.set(key, { at: Date.now(), value });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  return value;
}

/**
 * A plan may name a library voice by its id. Our own account also holds the workspaces' clones; a library id must
 * never be one of those (they are private to their workspace and reached only as "clone:<id>"). ponytail: any other
 * voice someone adds to our ElevenLabs account by hand would pass too; keep the account to stock and clones.
 */
export async function isLibraryVoice(voice: string) {
  if (!voice.startsWith("library:")) return false;
  const id = voice.slice("library:".length);
  if (!VOICE_ID.test(id)) return false;
  return !(await prisma.voice.findFirst({ where: { providerVoiceId: id }, select: { id: true } }));
}

// ponytail: the plan rarely changes: asked at most every 10 minutes.
let paid: { at: number; value: boolean } | null = null;
/**
 * Whether our ElevenLabs plan can speak with library voices (any paid plan). A failed lookup isn't remembered.
 * To confirm at the upgrade: a paid plan may still need a library voice added to our account first
 * (POST /v1/voices/add/{public_owner_id}/{voice_id}, which uses a voice slot); if so, renders fail with
 * voice_not_found (refunded) until that's added here.
 */
export async function libraryUsable() {
  if (paid && Date.now() - paid.at < 10 * 60_000) return paid.value;
  const res = await fetch(`${EL}/user/subscription`, { headers: { "xi-api-key": process.env.ELEVENLABS_API_KEY ?? "" }, signal: AbortSignal.timeout(10_000) }).catch(() => null);
  if (!res?.ok) return false;
  const tier = ((await res.json()) as { tier?: string }).tier;
  paid = { at: Date.now(), value: !!tier && tier !== "free" };
  return paid.value;
}
