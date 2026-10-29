import { z } from "zod";
import { problemResponse } from "@/server/api/http-error";
import { invalid } from "@/server/api/workspace-route";
import { requestUserId } from "@/server/auth/request-user";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { PlacesError, searchPlaces } from "@/server/integrations/places";

const Input = z.object({
  query: z.string().trim().min(2).max(200),
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).default("en"),
});

/**
 * Onboarding (mobile, "Google Maps" source): businesses matching "name + city" for the owner to pick theirs.
 * Each search is a billed Google call, so it's limited per person like the website check.
 */
export async function POST(request: Request) {
  const userId = await requestUserId(request);
  if (!userId) return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
  const body = Input.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid("Enter your business name and city.");
  const { allowed } = await hitRateLimit(`places-search:${userId}`, 30, 3_600_000);
  if (!allowed) return problemResponse({ type: "https://api.brandpilot/errors/limit", title: "Too many searches. Try again in a while.", status: 429 });
  try {
    return Response.json({ places: await searchPlaces(body.data.query, body.data.language, { userId }) });
  } catch (error) {
    if (error instanceof PlacesError) return problemResponse({ type: "https://api.brandpilot/errors/places", title: error.message, status: 503, detail: error.message });
    throw error;
  }
}
