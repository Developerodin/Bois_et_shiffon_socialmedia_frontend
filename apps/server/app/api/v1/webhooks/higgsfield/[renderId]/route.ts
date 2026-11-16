import { timingSafeEqual } from "node:crypto";
import { clientIp, hitRateLimit, limitKey } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db/prisma";
import { kickRunner } from "@/server/jobs/runner";
import { enqueueTick } from "@/server/reels/render";

// The nudge runs the render's next step after the response.
export const maxDuration = 300;

/**
 * Higgsfield calls this when a clip finishes. It is only a nudge: the render re-reads every status from
 * Higgsfield with our key and downloads only what that answer points to, so the body is never trusted.
 * Always 200 with nothing in it, so the endpoint tells a caller nothing.
 */
export async function POST(request: Request, context: { params: Promise<{ renderId: string }> }) {
  const { renderId } = await context.params;
  const secret = new URL(request.url).searchParams.get("s") ?? "";
  const limited = await hitRateLimit(limitKey("hf-webhook", clientIp(request) ?? "unknown"), 120, 60_000).catch(() => ({ allowed: true }));
  if (limited.allowed && /^[a-z0-9]{10,40}$/.test(renderId)) {
    const r = await prisma.reelRender.findUnique({ where: { id: renderId } });
    const ok = r && secret.length === r.webhookSecret.length && timingSafeEqual(Buffer.from(secret), Buffer.from(r.webhookSecret));
    if (ok && r.step === "CLIPS") { // only clips finish at Higgsfield; a JOIN is already running
      await enqueueTick(r);
      kickRunner();
    }
  }
  return Response.json({});
}
