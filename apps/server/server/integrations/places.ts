import { z } from "zod";
import { recordApiCall, type UsageScope } from "@/server/usage/api-calls";

/**
 * Google Places API (New): find a business on Google Maps (mobile onboarding) and read the listing the owner picked.
 * Server-side only; the key never reaches the app. One key covers all Google services here, so GOOGLE_MAPS_API_KEY
 * falls back to the PageSpeed key (it must allow "Places API (New)" in its API restrictions).
 * Field masks ask only for what's shown or used: Google bills by the fields requested.
 */
const BASE = "https://places.googleapis.com/v1";
const TIMEOUT_MS = 10_000;

export class PlacesError extends Error {}

const apiKey = () => process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PAGESPEED_API_KEY || null;
export const placesConfigured = () => apiKey() !== null;

/** Google's place ids are URL-safe tokens; anything else never reaches Google. */
export const PlaceId = z.string().regex(/^[A-Za-z0-9_-]{10,300}$/, "Invalid place");

const Place = z.object({
  id: z.string(),
  displayName: z.object({ text: z.string() }).optional(),
  formattedAddress: z.string().optional(),
  primaryTypeDisplayName: z.object({ text: z.string() }).optional(),
  rating: z.number().optional(),
  userRatingCount: z.number().optional(),
  websiteUri: z.string().optional(),
  nationalPhoneNumber: z.string().optional(),
  googleMapsUri: z.string().optional(),
  businessStatus: z.string().optional(),
  editorialSummary: z.object({ text: z.string() }).optional(),
  regularOpeningHours: z.object({ weekdayDescriptions: z.array(z.string()).optional() }).optional(),
});
type Place = z.infer<typeof Place>;

async function call(path: string, fields: string, init: { method: "GET" | "POST"; body?: unknown }, scope: UsageScope) {
  const key = apiKey();
  if (!key) throw new PlacesError("Google Maps search isn't set up on this server");
  const operation = path.startsWith("/places:searchText") ? "google-places.search" : "google-places.details";
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: init.method,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { "X-Goog-Api-Key": key, "X-Goog-FieldMask": fields, ...(init.body ? { "content-type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  await recordApiCall(operation, res.ok, started, scope);
  if (res.status === 404) return null;
  if (!res.ok) {
    // Google's text names the key's project and reason: logs only, never a response body.
    console.error(`[places] ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
    throw new PlacesError("Google Maps search isn't available right now. Try again in a moment.");
  }
  return (await res.json()) as unknown;
}

export type PlaceMatch = { id: string; name: string; address: string | null; type: string | null; rating: number | null; ratingCount: number | null };

/** Some owners put SEO text in the listing name ("Myth I Bangkok Street food | Best mango sticky rice"): the name is the part before the first " | ". */
export const listingName = (s: string) => s.split(/\s+\|\s+/)[0].trim() || s.trim();

const match = (p: Place): PlaceMatch => ({
  id: p.id,
  name: listingName(p.displayName?.text ?? ""),
  address: p.formattedAddress ?? null,
  type: p.primaryTypeDisplayName?.text ?? null,
  rating: p.rating ?? null,
  ratingCount: p.userRatingCount ?? null,
});

/** Up to 5 businesses for "name + city", for the owner to pick theirs. Closed-for-good places are left out. */
export async function searchPlaces(query: string, language: string, scope: UsageScope = {}): Promise<PlaceMatch[]> {
  const body = await call(
    "/places:searchText",
    "places.id,places.displayName,places.formattedAddress,places.primaryTypeDisplayName,places.rating,places.userRatingCount,places.businessStatus",
    { method: "POST", body: { textQuery: query, languageCode: language, maxResultCount: 5 } },
    scope,
  );
  const places = z.object({ places: z.array(Place).optional() }).parse(body ?? {}).places ?? [];
  return places.filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY" && p.displayName?.text).map(match);
}

/** What's kept on the brand (BrandProfile.place) and shown to Research. */
export const PlaceListing = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  type: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  rating: z.number().nullable(),
  ratingCount: z.number().nullable(),
  hours: z.array(z.string()),
  summary: z.string().nullable(),
  mapsUrl: z.string().nullable(),
});
export type PlaceListing = z.infer<typeof PlaceListing>;

/** The listing the owner picked. Null when Google no longer has it. */
export async function placeDetails(id: string, language: string, scope: UsageScope = {}): Promise<PlaceListing | null> {
  const body = await call(
    `/places/${encodeURIComponent(PlaceId.parse(id))}?languageCode=${encodeURIComponent(language)}`,
    "id,displayName,formattedAddress,primaryTypeDisplayName,rating,userRatingCount,websiteUri,nationalPhoneNumber,googleMapsUri,editorialSummary,regularOpeningHours.weekdayDescriptions",
    { method: "GET" },
    scope,
  );
  if (!body) return null;
  const p = Place.parse(body);
  return {
    ...match(p),
    phone: p.nationalPhoneNumber ?? null,
    website: p.websiteUri ?? null,
    hours: p.regularOpeningHours?.weekdayDescriptions ?? [],
    summary: p.editorialSummary?.text ?? null,
    mapsUrl: p.googleMapsUri ?? null,
  };
}

/** The listing as material for Research: data from Google, labelled as such. */
export function listingText(l: PlaceListing) {
  return [
    `Google Maps listing (picked by the owner as their business):`,
    `- Name: ${l.name}`,
    l.type && `- Type: ${l.type}`,
    l.address && `- Address: ${l.address}`,
    l.phone && `- Phone: ${l.phone}`,
    l.website && `- Website: ${l.website}`,
    l.rating !== null && `- Rating: ${l.rating} (${l.ratingCount ?? 0} reviews)`,
    l.summary && `- Google's description: ${l.summary}`,
    l.hours.length ? `- Opening hours: ${l.hours.join("; ")}` : null,
    l.mapsUrl && `- Maps: ${l.mapsUrl}`,
  ]
    .filter(Boolean)
    .join("\n");
}
