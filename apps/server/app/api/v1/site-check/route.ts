import { z } from "zod";
import { problemResponse } from "@/server/api/http-error";
import { invalid } from "@/server/api/workspace-route";
import { requestUserId } from "@/server/auth/request-user";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { CrawlError, safeFetch } from "@/server/research/crawl";

const Input = z.object({ url: z.string().trim().url() });

/**
 * Onboarding (mobile A06): does this website exist? Checked before a brand is created, so a typo is caught on the
 * website screen. Same SSRF-guarded fetch Research uses. A site that exists but refuses automated reading is "ok":
 * Research then looks the business up online instead of reading its pages.
 */
export async function POST(request: Request) {
  const userId = await requestUserId(request);
  if (!userId) return problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });
  const body = Input.safeParse(await request.json().catch(() => null));
  if (!body.success) return invalid("Enter a website address.");
  const { allowed } = await hitRateLimit(`site-check:${userId}`, 30, 3_600_000);
  if (!allowed) return problemResponse({ type: "https://api.brandpilot/errors/limit", title: "Too many checks. Try again in a while.", status: 429 });
  // Only an address that doesn't exist stops onboarding (bad URL, no such domain, private address). A real site
  // that refuses automated reading (bot check, 403, dropped connection) passes: Research then finds it online.
  const error = await safeFetch(body.data.url).then(() => null, (e: unknown) => e);
  return Response.json({ ok: !(error instanceof CrawlError) });
}
