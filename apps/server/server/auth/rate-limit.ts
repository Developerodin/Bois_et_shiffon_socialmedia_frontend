import { createHash } from "node:crypto";
import { prisma } from "@/server/db/prisma";

/**
 * Fixed-window rate limiting backed by Postgres (adapted from Cad's rate-limit
 * policy; Cad needs Redis for multi-instance — one atomic upsert here does the same).
 * ponytail: fixed window allows a 2x burst at window edges; switch to sliding
 * window if that matters. Old rows are harmless; prune in the daily sweep later.
 */
export async function hitRateLimit(key: string, limit: number, windowMs: number) {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" (key, count, "windowStart")
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimitBucket"."windowStart" < now() - ${`${windowMs} milliseconds`}::interval
                   THEN 1 ELSE "RateLimitBucket".count + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < now() - ${`${windowMs} milliseconds`}::interval
                   THEN now() ELSE "RateLimitBucket"."windowStart" END
    RETURNING count`;
  return { allowed: rows[0].count <= limit, count: rows[0].count };
}

export async function resetRateLimit(key: string) {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
}

/** Never store raw emails/IPs as keys. */
export const limitKey = (kind: string, value: string) =>
  `${kind}:${createHash("sha256").update(value.trim().toLowerCase()).digest("hex").slice(0, 32)}`;

/**
 * Right-most X-Forwarded-For entry, else x-real-ip, else "unknown". We run behind one trusted
 * proxy hop (our ALB or nginx), which appends the real peer address; earlier entries are
 * client-supplied and spoofable. Adding a second proxy hop means revisiting this.
 */
export function clientIp(request: Request | undefined) {
  const forwarded = request?.headers.get("x-forwarded-for")?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return forwarded || request?.headers.get("x-real-ip")?.trim() || "unknown";
}

export const LOGIN_LIMITS = {
  perEmail: { limit: 5, windowMs: 15 * 60_000 }, // per email from one IP
  perEmailAnyIp: { limit: 50, windowMs: 15 * 60_000 },
  perIp: { limit: 30, windowMs: 15 * 60_000 },
};
