import type { User } from "@prisma/client";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/prisma";
import { clientIp, hitRateLimit, limitKey, LOGIN_LIMITS, resetRateLimit } from "@/server/auth/rate-limit";

/**
 * bcrypt hash of a non-secret dummy password, compared when the account is
 * missing or ineligible so those paths take as long as a wrong password
 * (no account enumeration by timing — ported from Cad auth.service).
 */
const DUMMY_PASSWORD_HASH = "$2b$12$UkddbF/86alJWNEWq7F2ju4bDGe23vdxWL6PsTYN8jA7yz9QfpNKm";

export class LoginRateLimited extends Error {}

/** Who can sign in with a password: the one rule web sign-in, mobile sign-in and the app's email step share. */
export const canUsePassword = (user: Pick<User, "passwordHash" | "status" | "deletedAt"> | null) =>
  Boolean(user?.passwordHash && user.status === "ACTIVE" && !user.deletedAt);

/**
 * Email + password check shared by web sign-in (Auth.js credentials) and the mobile app.
 * Returns the user, or null for a wrong/unknown/disabled account (same timing either way).
 */
export async function checkPassword(emailRaw: string, password: string, request: Request | undefined): Promise<User | null> {
  const email = emailRaw.trim().toLowerCase();
  // Tight limit per (email, IP): guessing from one place stops fast, but a stranger elsewhere
  // can't lock the real person out. A looser per-email limit still caps guessing spread over many IPs.
  const ip = clientIp(request);
  const emailKey = limitKey("login:email-ip", `${email}|${ip}`);
  const [byEmailIp, byEmail, byIp] = await Promise.all([
    hitRateLimit(emailKey, LOGIN_LIMITS.perEmail.limit, LOGIN_LIMITS.perEmail.windowMs),
    hitRateLimit(limitKey("login:email", email), LOGIN_LIMITS.perEmailAnyIp.limit, LOGIN_LIMITS.perEmailAnyIp.windowMs),
    hitRateLimit(limitKey("login:ip", ip), LOGIN_LIMITS.perIp.limit, LOGIN_LIMITS.perIp.windowMs),
  ]);
  if (!byEmailIp.allowed || !byEmail.allowed || !byIp.allowed) throw new LoginRateLimited();

  const user = await prisma.user.findUnique({ where: { email } });
  const eligible = canUsePassword(user);
  const valid = await bcrypt.compare(String(password), eligible && user?.passwordHash ? user.passwordHash : DUMMY_PASSWORD_HASH);
  if (!eligible || !user || !valid) {
    await prisma.auditEvent.create({
      data: {
        actorUserId: user?.id,
        action: "auth.login_failed",
        entityType: "User",
        entityId: user?.id ?? emailKey, // unknown email: hashed key, never the raw address
        metadata: { ip },
      },
    });
    return null;
  }

  await resetRateLimit(emailKey);
  await prisma.auditEvent.create({ data: { actorUserId: user.id, action: "auth.login", entityType: "User", entityId: user.id, metadata: { ip } } });
  return user;
}
