import { createHash, randomInt } from "node:crypto";
import bcrypt from "bcryptjs";
import { createRemoteJWKSet, jwtVerify, SignJWT } from "jose";
import { z } from "zod";
import { canUsePassword, checkPassword, LoginRateLimited } from "@/server/auth/password-check";
import { issueMobileToken } from "@/server/auth/request-user";
import { clientIp, hitRateLimit, limitKey } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db/prisma";
import { queueEmail } from "@/server/email/outbox";
import { signInCodeHtml } from "@/server/email/sign-in-code";
import { AccountFlowError, Password } from "@/server/services/accounts";
import { provisionGoogleUser } from "@/server/services/google-signup";
import { recordApiCall } from "@/server/usage/api-calls";

/**
 * Passwordless email sign-in for the mobile app (Figma A14 → A02): a 6-digit code by email,
 * exchanged for a mobile token. Codes live in Auth.js's VerificationToken table (hashed, 10 min,
 * one live code per email). New emails get an account + workspace, the same way Google sign-up does.
 */
const CODE_TTL_MS = 10 * 60_000;
const identifier = (email: string) => `mobile-code:${email}`;
const hash = (email: string, code: string) => createHash("sha256").update(`${email}:${code}:${process.env.AUTH_SECRET}`).digest("hex");

export const EmailInput = z.object({ email: z.string().trim().toLowerCase().email().max(254) });
const Code = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code");
/** phoneTicket: present when this email finishes a phone sign-up (see verifyPhoneCode). */
export const CodeInput = EmailInput.extend({ code: Code, phoneTicket: z.string().max(1024).optional() });

export async function sendEmailCode(input: z.infer<typeof EmailInput>, request: Request) {
  const { email } = input;
  const [byEmail, byIp] = await Promise.all([
    hitRateLimit(limitKey("mobile-code:email", email), 5, 15 * 60_000),
    hitRateLimit(limitKey("mobile-code:ip", clientIp(request)), 30, 15 * 60_000),
  ]);
  if (!byEmail.allowed || !byIp.allowed) throw new AccountFlowError("Too many codes requested. Wait 15 minutes and try again.", 429);

  // Disabled accounts get no code, but the response is identical so emails can't be probed.
  const existing = await prisma.user.findUnique({ where: { email }, select: { status: true, deletedAt: true } });
  if (existing && (existing.status !== "ACTIVE" || existing.deletedAt)) return;

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  await prisma.$transaction(async (tx) => {
    // One live code per email: each extra live code would multiply a guesser's odds (8 tries per 15 min, 6 digits).
    // ponytail: so a stranger requesting codes for someone's email voids the one in their inbox, and 8 wrong guesses
    // lock its verifying for 15 min; per-email limits can't tell them from the owner. Upgrade: longer codes or a
    // per-device challenge if that abuse shows up.
    await tx.verificationToken.deleteMany({ where: { identifier: identifier(email) } });
    await tx.verificationToken.create({ data: { identifier: identifier(email), token: hash(email, code), expires: new Date(Date.now() + CODE_TTL_MS) } });
    await queueEmail(tx, {
      to: email,
      subject: `${code} is your Espanda sign-in code`,
      text: `Your Espanda sign-in code is ${code}.\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email.`,
      html: signInCodeHtml(code),
    });
  });
}

export async function verifyEmailCode(input: z.infer<typeof CodeInput>, request: Request) {
  const { email, code } = input;
  // Checked before the code is used up, so a stale ticket doesn't cost the person their code.
  const phone = input.phoneTicket ? await readPhoneTicket(input.phoneTicket) : null;
  await spendCode(email, code);
  const result = await signInVerifiedEmail({ email, name: null }, "mobile-email-code", request);
  // The code is already spent: a failed link must not also fail the sign-in. They can add the number again.
  if (phone) await linkPhone(result.user.id, phone).catch((e: unknown) => console.error("[mobile-auth] phone link failed", e));
  return result;
}

/** Spends an emailed code: throws unless it's right and unexpired. */
async function spendCode(email: string, code: string) {
  const attempts = await hitRateLimit(limitKey("mobile-verify:email", email), 8, 15 * 60_000);
  if (!attempts.allowed) throw new AccountFlowError("Too many attempts. Request a new code in 15 minutes.", 429);
  // Single use: the delete is the check, so two parallel submits can't both succeed.
  const used = await prisma.verificationToken.deleteMany({ where: { identifier: identifier(email), token: hash(email, code), expires: { gt: new Date() } } });
  if (used.count !== 1) throw new AccountFlowError("That code is wrong or has expired.", 400);
}

/**
 * Email + password on the phone. Sign-in shares web's check (rate limits, timing, audit).
 * Registration proves the email first: the code goes out on start, and the password is only saved once the code
 * checks out (the app keeps the password in memory between the two screens; nothing is stored before then).
 */
/**
 * Email-first sign-in: after the email screen, which screen comes next. This tells the app whether an email has an
 * account (as most apps do); it's rate-limited, and a disabled account answers like one without a password.
 */
export async function emailNextStep(input: z.infer<typeof EmailInput>, request: Request): Promise<{ next: "password" | "code" | "register" }> {
  const email = input.email.trim().toLowerCase();
  const byIp = await hitRateLimit(limitKey("mobile-email-step:ip", clientIp(request)), 30, 15 * 60_000);
  if (!byIp.allowed) throw new AccountFlowError("Too many attempts. Wait 15 minutes and try again.", 429);
  const user = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true, status: true, deletedAt: true } });
  if (!user) return { next: "register" };
  return { next: canUsePassword(user) ? "password" : "code" };
}

export const PasswordSignInInput = EmailInput.extend({ password: z.string().min(1).max(200) });
export const RegisterInput = EmailInput.extend({ password: z.string().max(200) });
export const RegisterVerifyInput = RegisterInput.extend({ code: Code });

export async function passwordSignIn(input: z.infer<typeof PasswordSignInInput>, request: Request) {
  const user = await checkPassword(input.email, input.password, request).catch((e: unknown) => {
    if (e instanceof LoginRateLimited) throw new AccountFlowError("Too many attempts. Try again in 15 minutes, or sign in with an email code.", 429);
    throw e;
  });
  if (!user) throw new AccountFlowError("Wrong email or password.", 400); // not 401: the app reads 401 as "session expired"
  return { token: await issueMobileToken(user), user: { id: user.id, email: user.email, name: user.name } };
}

const validPassword = (password: string) => {
  const ok = Password.safeParse(password);
  if (!ok.success) throw new AccountFlowError(ok.error.issues[0]?.message ?? "Choose a longer password.", 400);
};

export async function startRegistration(input: z.infer<typeof RegisterInput>, request: Request) {
  const email = input.email.trim().toLowerCase();
  validPassword(input.password);
  // Limited before the account check: the "already have an account" answer must cost the same as the email step's.
  const byIp = await hitRateLimit(limitKey("mobile-register:ip", clientIp(request)), 30, 15 * 60_000);
  if (!byIp.allowed) throw new AccountFlowError("Too many attempts. Wait 15 minutes and try again.", 429);
  const existing = await prisma.user.findUnique({ where: { email }, select: { passwordHash: true } });
  if (existing?.passwordHash) throw new AccountFlowError("You already have an account with this email. Sign in with your password.", 409);
  await sendEmailCode({ email }, request);
}

export async function completeRegistration(input: z.infer<typeof RegisterVerifyInput>, request: Request) {
  const email = input.email.trim().toLowerCase();
  validPassword(input.password);
  await spendCode(email, input.code);
  const result = await signInVerifiedEmail({ email, name: null }, "mobile-register", request);
  // An account made by email code or Google gets its first password here; one that has a password keeps it.
  // (Changing a password is the reset-by-email flow, not this.)
  await prisma.user.updateMany({ where: { id: result.user.id, passwordHash: null }, data: { passwordHash: await bcrypt.hash(input.password, 12) } });
  return result;
}

export const GoogleInput = z.object({ idToken: z.string().min(20).max(4096) });

// Google rotates these keys; jose caches them and refetches on an unknown key id.
const googleKeys = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

/**
 * "Continue with Google" on the phone: the app's native Google sign-in returns an ID token issued
 * for our web client ID (the app passes it as webClientId), so the same GOOGLE_CLIENT_ID is the audience.
 */
export async function verifyGoogleSignIn(input: z.infer<typeof GoogleInput>, request: Request) {
  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new AccountFlowError("Google sign-in isn't set up on this server.", 400);
  const { payload } = await jwtVerify(input.idToken, googleKeys, { issuer: ["https://accounts.google.com", "accounts.google.com"], audience }).catch(() => {
    throw new AccountFlowError("Google sign-in didn't go through. Try again.", 400);
  });
  // Same rule as the web Google login (auth.ts): only addresses Google has verified.
  if (payload.email_verified !== true || typeof payload.email !== "string") throw new AccountFlowError("Your Google account's email isn't verified.", 400);
  const name = typeof payload.name === "string" ? payload.name : null;
  return signInVerifiedEmail({ email: payload.email.toLowerCase(), name }, "mobile-google", request);
}

/** Finds or creates the account for an email the caller has proven, and issues the mobile token. */
async function signInVerifiedEmail({ email, name }: { email: string; name: string | null }, provider: string, request: Request) {
  let user = await prisma.user.findUnique({ where: { email } });
  if (user && (user.status !== "ACTIVE" || user.deletedAt)) throw new AccountFlowError("This account is disabled. Ask a workspace owner to restore it.", 400);
  if (!user) {
    user = await prisma.user.create({ data: { email, name, emailVerified: new Date() } });
    await provisionGoogleUser({ id: user.id, email, name });
  } else if (!user.emailVerified) {
    user = await prisma.user.update({ where: { id: user.id }, data: { emailVerified: new Date() } });
  }
  await prisma.auditEvent.create({
    data: { actorUserId: user.id, action: "auth.login", entityType: "User", entityId: user.id, metadata: { provider, ip: clientIp(request) } },
  });
  return { token: await issueMobileToken(user), user: { id: user.id, email: user.email, name: user.name } };
}

/**
 * Phone sign-in (Figma A01 → A02) through Twilio Verify, which generates, sends and checks the codes.
 * Accounts still need an email: a known number signs straight in; a new number gets a short-lived
 * phoneTicket, the app asks for an email, and verifying that email links the number to the account.
 * The link is an Account row (provider "phone"), so no schema change.
 */
export const PhoneInput = z.object({ phone: z.string().trim().regex(/^\+[1-9]\d{7,14}$/, "Enter a valid mobile number") });
export const PhoneCodeInput = PhoneInput.extend({ code: Code });

const TICKET_TTL = "20m";
const ticketKey = () => createHash("sha256").update(`phone-ticket:${process.env.AUTH_SECRET}`).digest();

export async function sendPhoneCode({ phone }: z.infer<typeof PhoneInput>, request: Request) {
  // Every text costs money, and X-Forwarded-For can be faked off Vercel, so there's also a cap for everyone together.
  // ponytail: 300/hour total; raise it with real traffic, and limit Twilio's SMS countries (Geo Permissions) to launch markets.
  const [byPhone, byIp, all] = await Promise.all([
    hitRateLimit(limitKey("mobile-sms:phone", phone), 5, 15 * 60_000),
    hitRateLimit(limitKey("mobile-sms:ip", clientIp(request)), 20, 15 * 60_000),
    hitRateLimit("mobile-sms:all", 300, 60 * 60_000),
  ]);
  if (!all.allowed) throw new AccountFlowError("Text-message codes are busy right now. Use email instead.", 429);
  if (!byPhone.allowed || !byIp.allowed) throw new AccountFlowError("Too many codes requested. Wait 15 minutes and try again.", 429);
  await twilioVerify("Verifications", { To: phone, Channel: "sms" });
}

export async function verifyPhoneCode({ phone, code }: z.infer<typeof PhoneCodeInput>, request: Request) {
  const attempts = await hitRateLimit(limitKey("mobile-sms-verify:phone", phone), 8, 15 * 60_000);
  if (!attempts.allowed) throw new AccountFlowError("Too many attempts. Request a new code in 15 minutes.", 429);
  const check = await twilioVerify("VerificationCheck", { To: phone, Code: code });
  if (check?.status !== "approved") throw new AccountFlowError("That code is wrong or has expired.", 400);

  const linked = await prisma.account.findUnique({ where: { provider_providerAccountId: { provider: "phone", providerAccountId: phone } }, include: { user: true } });
  if (!linked) {
    const phoneTicket = await new SignJWT({ phone }).setProtectedHeader({ alg: "HS256" }).setAudience("phone-link").setExpirationTime(TICKET_TTL).sign(ticketKey());
    return { needsEmail: true as const, phoneTicket };
  }
  const user = linked.user;
  if (user.status !== "ACTIVE" || user.deletedAt) throw new AccountFlowError("This account is disabled. Ask a workspace owner to restore it.", 400);
  await prisma.auditEvent.create({
    data: { actorUserId: user.id, action: "auth.login", entityType: "User", entityId: user.id, metadata: { provider: "mobile-phone-code", ip: clientIp(request) } },
  });
  return { token: await issueMobileToken(user), user: { id: user.id, email: user.email, name: user.name } };
}

async function readPhoneTicket(ticket: string) {
  const { payload } = await jwtVerify(ticket, ticketKey(), { audience: "phone-link" }).catch(() => {
    throw new AccountFlowError("Your mobile number check expired. Start again with your number.", 400);
  });
  return String(payload.phone);
}

/** First link wins: a number already on another account stays there (skipDuplicates). */
async function linkPhone(userId: string, phone: string) {
  await prisma.account.createMany({ data: [{ userId, type: "phone", provider: "phone", providerAccountId: phone }], skipDuplicates: true });
}

// Twilio error codes people can act on; anything else is a server problem.
const TWILIO_ERRORS: Record<number, [string, 400 | 429]> = {
  60200: ["Enter a valid mobile number.", 400],
  21211: ["Enter a valid mobile number.", 400],
  21608: ["This number can't receive codes yet. Use email instead.", 400], // trial account: number not verified in Twilio
  60203: ["Too many codes requested. Wait 10 minutes and try again.", 429],
  60202: ["Too many attempts. Request a new code.", 429],
  60410: ["Codes can't be sent to this number. Use email instead.", 400], // Twilio fraud guard
};

async function twilioVerify(path: "Verifications" | "VerificationCheck", form: Record<string, string>): Promise<{ status?: string } | null> {
  const { TWILIO_ACCOUNT_SID: sid, TWILIO_AUTH_TOKEN: token, TWILIO_VERIFY_SERVICE_SID: service } = process.env;
  if (!sid || !token || !service) throw new AccountFlowError("Text-message sign-in isn't set up on this server yet.", 400);
  const started = Date.now();
  const res = await fetch(`https://verify.twilio.com/v2/Services/${service}/${path}`, {
    method: "POST",
    headers: { Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(10_000),
  });
  if (res.ok) {
    const body = (await res.json()) as { status?: string };
    // Twilio bills every SMS sent, and the $0.05 verification fee only when a code is approved.
    await (path === "Verifications"
      ? recordApiCall("twilio-verify.send", true, started)
      : recordApiCall("twilio-verify.check", true, started, { billed: body.status === "approved" ? ["twilio-verify.approved"] : [] }));
    return body;
  }
  await recordApiCall(path === "Verifications" ? "twilio-verify.send" : "twilio-verify.check", false, started);
  // Checking a code that expired or was already used comes back as 404.
  if (path === "VerificationCheck" && res.status === 404) return null;
  const err = (await res.json().catch(() => ({}))) as { code?: number; message?: string };
  const known = err.code ? TWILIO_ERRORS[err.code] : undefined;
  if (known) throw new AccountFlowError(...known);
  console.error("[mobile-auth] Twilio", path, res.status, err);
  throw new Error(`Twilio ${path} ${res.status} ${err.code ?? ""} ${err.message ?? ""}`);
}
