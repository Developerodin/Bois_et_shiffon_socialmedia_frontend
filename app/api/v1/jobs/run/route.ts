import { timingSafeEqual } from "node:crypto";
import { problemResponse } from "@/server/api/http-error";
import { enqueueDailySweep, runDueJobs } from "@/server/jobs/runner";

export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false; // fail closed when not configured
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

const unauthorized = () =>
  problemResponse({ type: "https://api.brandpilot/errors/unauthorized", title: "Unauthorized", status: 401 });

/** Vercel Cron (daily): enqueue the daily sweep, then drain the queue. */
export async function GET(request: Request) {
  if (!authorized(request)) return unauthorized();
  await enqueueDailySweep();
  return Response.json(await runDueJobs({ budgetMs: 50_000 }));
}

/** Manual / dev kick: drain due jobs only. */
export async function POST(request: Request) {
  if (!authorized(request)) return unauthorized();
  return Response.json(await runDueJobs({ budgetMs: 50_000 }));
}
