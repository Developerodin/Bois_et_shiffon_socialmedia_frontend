import { hitRateLimit } from "@/server/auth/rate-limit";
import { requestUserId } from "@/server/auth/request-user";
import { cleanPagePath, recordPageView } from "@/server/services/activity";

const str = (v: unknown) => (typeof v === "string" && v ? v : undefined);

/**
 * One page visit from the web app (sendBeacon) or the mobile app (Bearer token). Always answers 204: a visit that
 * can't be recorded is dropped, and the person never sees an error for it.
 */
export async function POST(request: Request) {
  try {
    const userId = await requestUserId(request);
    if (!userId) return done();
    const body = await request.json().catch(() => null);
    const path = cleanPagePath(body?.path);
    const platform = body?.platform;
    if (!path || (platform !== "web" && platform !== "mobile")) return done();
    if (!(await hitRateLimit(`pv:${userId}`, 120, 60_000)).allowed) return done();
    await recordPageView({ userId, platform, path, workspaceId: str(body.workspaceId), brandId: str(body.brandId) });
  } catch (error) {
    console.error("page view", error);
  }
  return done();
}

const done = () => new Response(null, { status: 204 });
