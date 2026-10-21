import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { authConfig } from "@/auth.config";
import { prisma } from "@/server/db/prisma";
import {
  clientIp,
  hitRateLimit,
  limitKey,
  LOGIN_LIMITS,
  resetRateLimit,
} from "@/server/auth/rate-limit";
import { provisionGoogleUser } from "@/server/services/google-signup";

/**
 * bcrypt hash of a non-secret dummy password, compared when the account is
 * missing or ineligible so those paths take as long as a wrong password
 * (no account enumeration by timing — ported from Cad auth.service).
 */
const DUMMY_PASSWORD_HASH =
  "$2b$12$UkddbF/86alJWNEWq7F2ju4bDGe23vdxWL6PsTYN8jA7yz9QfpNKm";

class TooManyAttempts extends CredentialsSignin {
  code = "rate_limited";
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  callbacks: {
    ...authConfig.callbacks,
    /** Google: only verified emails, and never a disabled or deleted account. */
    async signIn({ account, profile }) {
      if (account?.provider !== "google") return true;
      const email = typeof profile?.email === "string" ? profile.email.toLowerCase() : null;
      if (!email || profile?.email_verified !== true) return "/login?error=google_unverified";
      const existing = await prisma.user.findUnique({ where: { email }, select: { status: true, deletedAt: true } });
      if (existing && (existing.status !== "ACTIVE" || existing.deletedAt)) return "/login?error=disabled";
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
        token.sv = (user as { sessionVersion?: number }).sessionVersion ?? 0;
        return token;
      }
      // Revocation: a disabled account or bumped sessionVersion ends every session.
      // ponytail: one indexed DB read per auth() call; cache per request if it shows up in traces.
      if (token.sub) {
        const current = await prisma.user.findUnique({
          where: { id: token.sub },
          select: { status: true, deletedAt: true, sessionVersion: true },
        });
        if (
          !current ||
          current.status !== "ACTIVE" ||
          current.deletedAt ||
          current.sessionVersion !== token.sv
        ) {
          return null;
        }
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
  events: {
    // New account from Google → join invited workspaces, or get their own (google-signup.ts).
    async createUser({ user }) {
      if (user.id && user.email) await provisionGoogleUser({ id: user.id, email: user.email, name: user.name });
    },
    async signIn({ user, account }) {
      if (account?.provider === "google" && user.id) {
        await prisma.auditEvent.create({
          data: { actorUserId: user.id, action: "auth.login", entityType: "User", entityId: user.id, metadata: { provider: "google" } },
        });
      }
    },
  },
  providers: [
    // Same Google OAuth client as the Analytics connection; sign-in only asks for openid, email, profile.
    // Linking by email is safe here because signIn() above requires Google's email_verified.
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
      ? [Google({ clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET, allowDangerousEmailAccountLinking: true })]
      : []),
    Credentials({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, request) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (!email || !password || typeof email !== "string") {
          return null;
        }

        // Tight limit per (email, IP): guessing from one place stops fast, but a stranger elsewhere
        // can't lock the real person out. A looser per-email limit still caps guessing spread over many IPs.
        const ip = clientIp(request);
        const emailKey = limitKey("login:email-ip", `${email}|${ip}`);
        const [byEmailIp, byEmail, byIp] = await Promise.all([
          hitRateLimit(emailKey, LOGIN_LIMITS.perEmail.limit, LOGIN_LIMITS.perEmail.windowMs),
          hitRateLimit(limitKey("login:email", email), LOGIN_LIMITS.perEmailAnyIp.limit, LOGIN_LIMITS.perEmailAnyIp.windowMs),
          hitRateLimit(limitKey("login:ip", ip), LOGIN_LIMITS.perIp.limit, LOGIN_LIMITS.perIp.windowMs),
        ]);
        if (!byEmailIp.allowed || !byEmail.allowed || !byIp.allowed) {
          throw new TooManyAttempts();
        }

        const user = await prisma.user.findUnique({
          where: { email: email.trim().toLowerCase() },
        });
        const eligible = Boolean(
          user && user.status === "ACTIVE" && !user.deletedAt && user.passwordHash,
        );
        const valid = await bcrypt.compare(
          String(password),
          eligible && user?.passwordHash ? user.passwordHash : DUMMY_PASSWORD_HASH,
        );
        if (!eligible || !user || !valid) {
          await prisma.auditEvent.create({
            data: {
              actorUserId: user?.id,
              action: "auth.login_failed",
              entityType: "User",
              entityId: user?.id ?? emailKey, // unknown email: hashed key, never the raw address
              metadata: { ip: clientIp(request) },
            },
          });
          return null;
        }

        await resetRateLimit(emailKey);
        await prisma.auditEvent.create({
          data: {
            actorUserId: user.id,
            action: "auth.login",
            entityType: "User",
            entityId: user.id,
            metadata: { ip: clientIp(request) },
          },
        });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});
