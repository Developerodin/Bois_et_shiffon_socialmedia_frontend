import { decode, encode } from "next-auth/jwt";
import { auth } from "@/auth";
import { prisma } from "@/server/db/prisma";

/**
 * Mobile app tokens: the same Auth.js JWE as the web session, under a different salt so a mobile
 * token can't be replayed as a browser cookie and vice versa. Revocation is shared with the web:
 * a disabled account or bumped sessionVersion kills both.
 */
const SALT = "mobile-session";
export const MOBILE_TOKEN_MAX_AGE_S = 30 * 24 * 60 * 60;

export async function issueMobileToken(user: { id: string; sessionVersion: number }) {
  return encode({ token: { sub: user.id, sv: user.sessionVersion }, secret: process.env.AUTH_SECRET!, salt: SALT, maxAge: MOBILE_TOKEN_MAX_AGE_S });
}

async function mobileUserId(bearer: string): Promise<string | null> {
  const token = await decode({ token: bearer, secret: process.env.AUTH_SECRET!, salt: SALT }).catch(() => null);
  if (!token?.sub) return null;
  const user = await prisma.user.findUnique({ where: { id: token.sub }, select: { status: true, deletedAt: true, sessionVersion: true } });
  if (!user || user.status !== "ACTIVE" || user.deletedAt || user.sessionVersion !== token.sv) return null;
  return token.sub;
}

/** The signed-in user for an API request: mobile Bearer token first, else the web session cookie. */
export async function requestUserId(request: Request): Promise<string | null> {
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) return mobileUserId(header.slice(7).trim());
  const session = await auth();
  return session?.user?.id ?? null;
}
