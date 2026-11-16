import { problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { LibraryQuery, libraryUsable, searchLibrary } from "@/server/reels/library";
import { toReelProblem as toProblem } from "@/server/reels/service";

type Params = { params: Promise<BrandRouteParams> };

/**
 * Voices → Library: ElevenLabs' public voices, filtered (language, gender, age, accent, use case, search), 30 a page,
 * each with a preview. `usable`: whether reels can speak with them yet (ElevenLabs' paid plan).
 */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const parsed = LibraryQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
    if (!parsed.success) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400, detail: parsed.error.issues[0]?.message });
    const [found, usable] = await Promise.all([searchLibrary(parsed.data), libraryUsable()]);
    return Response.json({ ...found, usable });
  } catch (error) {
    return toProblem(error);
  }
}
