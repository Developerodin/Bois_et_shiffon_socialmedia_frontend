import { z } from "zod";
import { problemResponse } from "@/server/api/http-error";
import { invalid } from "@/server/api/workspace-route";
import { requestUserId } from "@/server/auth/request-user";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { safeFetch } from "@/server/research/crawl";

const Input = z.object({ url: z.string().trim().url() });

/**
 * Onboarding (mobile A06): does this website open? Checked before a brand is created, so a typo is
 * caught on the website screen instead of failing Research later. Same SSRF-guarded fetch Research uses,
 * so "ok" means Research can reach it too (a bot-blocking site answers 403 and is reported as not ok).
 */
export async function POST(request: Request) {
  const userId = await requestUserId(request);
  if (!userId) return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
  const body = Input.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid("Enter a website address.");
  const { allowed } = await hitRateLimit(`site-check:${userId}`, 30, 3_600_000);
  if (!allowed) return problemResponse({ type: "https://api.brandpilot/errors/limit", title: "Too many checks. Try again in a while.", status: 429 });
  const res = await safeFetch(body.data.url).catch(() => null);
  return Response.json({ ok: !!res && res.status < 400 });
}
