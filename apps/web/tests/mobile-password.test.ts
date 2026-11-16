import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => {
  const fn = () => vi.fn();
  const db = {
    user: { findUnique: fn(), create: fn(), update: fn(), updateMany: fn() },
    verificationToken: { deleteMany: fn(), create: fn() },
    auditEvent: { create: fn() },
  };
  return { db, prisma: { ...db, $transaction: vi.fn(async (f: (t: typeof db) => unknown) => f(db)) }, queueEmail: fn() };
});
vi.mock("@/server/db/prisma", () => ({ prisma: m.prisma }));
vi.mock("@/server/auth/rate-limit", async (orig) => ({ ...(await orig<object>()), hitRateLimit: vi.fn(async () => ({ allowed: true, count: 1 })), resetRateLimit: vi.fn() }));
vi.mock("@/server/auth/request-user", () => ({ issueMobileToken: vi.fn(async () => "tok") }));
vi.mock("@/server/email/outbox", () => ({ queueEmail: m.queueEmail }));
vi.mock("@/server/services/google-signup", () => ({ provisionGoogleUser: vi.fn() }));

import { completeRegistration, emailNextStep, passwordSignIn, sendEmailCode, startRegistration } from "@/server/services/mobile-auth";

const request = new Request("https://app/api/v1/mobile/password", { headers: { "x-forwarded-for": "1.2.3.4" } });
const PASSWORD = "correct horse battery";
const active = async (over: object = {}) => ({ id: "u1", email: "a@b.co", name: null, status: "ACTIVE", deletedAt: null, emailVerified: new Date(), sessionVersion: 0, passwordHash: await bcrypt.hash(PASSWORD, 4), ...over });

beforeEach(() => {
  vi.clearAllMocks();
  m.db.verificationToken.deleteMany.mockResolvedValue({ count: 1 });
});

describe("password sign-in (mobile)", () => {
  it("signs in with the right password", async () => {
    m.db.user.findUnique.mockResolvedValue(await active());
    await expect(passwordSignIn({ email: "A@b.co ", password: PASSWORD }, request)).resolves.toMatchObject({ token: "tok", user: { id: "u1" } });
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    m.db.user.findUnique.mockResolvedValue(await active());
    await expect(passwordSignIn({ email: "a@b.co", password: "wrong password!!" }, request)).rejects.toMatchObject({ message: "Wrong email or password.", status: 400 });
    m.db.user.findUnique.mockResolvedValue(null);
    await expect(passwordSignIn({ email: "x@b.co", password: PASSWORD }, request)).rejects.toMatchObject({ message: "Wrong email or password.", status: 400 });
  });

  it("doesn't sign in a disabled account", async () => {
    m.db.user.findUnique.mockResolvedValue(await active({ status: "DISABLED" }));
    await expect(passwordSignIn({ email: "a@b.co", password: PASSWORD }, request)).rejects.toMatchObject({ status: 400 });
  });
});

describe("register with email + password (mobile)", () => {
  it("refuses a short password before sending anything", async () => {
    await expect(startRegistration({ email: "n@b.co", password: "short" }, request)).rejects.toMatchObject({ status: 400 });
    expect(m.queueEmail).not.toHaveBeenCalled();
  });

  it("sends a code to a new email", async () => {
    m.db.user.findUnique.mockResolvedValue(null);
    await startRegistration({ email: "n@b.co", password: PASSWORD }, request);
    expect(m.queueEmail).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ to: "n@b.co" }));
  });

  it("points an email that already has a password to sign-in", async () => {
    m.db.user.findUnique.mockResolvedValue(await active());
    await expect(startRegistration({ email: "a@b.co", password: PASSWORD }, request)).rejects.toMatchObject({ status: 409 });
  });

  it("creates the account with the password once the emailed code checks out", async () => {
    m.db.user.findUnique.mockResolvedValueOnce(null).mockResolvedValue(null);
    m.db.user.create.mockImplementation(async (a: { data: object }) => ({ id: "u2", sessionVersion: 0, status: "ACTIVE", deletedAt: null, passwordHash: null, ...a.data }));
    m.db.user.updateMany.mockResolvedValue({ count: 1 });
    const r = await completeRegistration({ email: "n@b.co", code: "123456", password: PASSWORD }, request);
    expect(r.token).toBe("tok");
    const call = m.db.user.updateMany.mock.calls.at(-1)?.[0];
    expect(call.where).toEqual({ id: "u2", passwordHash: null }); // never overwrites an existing password
    expect(await bcrypt.compare(PASSWORD, call.data.passwordHash as string)).toBe(true);
  });

  it("rejects a wrong code and sets no password", async () => {
    m.db.verificationToken.deleteMany.mockResolvedValue({ count: 0 });
    await expect(completeRegistration({ email: "n@b.co", code: "000000", password: PASSWORD }, request)).rejects.toMatchObject({ status: 400 });
    expect(m.db.user.updateMany).not.toHaveBeenCalled();
  });
});

describe("email-first: which screen comes next", () => {
  it("an account with a password asks for it", async () => {
    m.db.user.findUnique.mockResolvedValue(await active());
    await expect(emailNextStep({ email: "a@b.co" }, request)).resolves.toEqual({ next: "password" });
  });
  it("an account without a password (email code, phone, Google) gets a code", async () => {
    m.db.user.findUnique.mockResolvedValue(await active({ passwordHash: null }));
    await expect(emailNextStep({ email: "a@b.co" }, request)).resolves.toEqual({ next: "code" });
  });
  it("a new email registers", async () => {
    m.db.user.findUnique.mockResolvedValue(null);
    await expect(emailNextStep({ email: "n@b.co" }, request)).resolves.toEqual({ next: "register" });
  });
  it("a disabled account looks like one without a password", async () => {
    m.db.user.findUnique.mockResolvedValue(await active({ status: "DISABLED" }));
    await expect(emailNextStep({ email: "a@b.co" }, request)).resolves.toEqual({ next: "code" });
  });
});

describe("email sign-in codes (mobile)", () => {
  it("a new code replaces every earlier code, so only one code per email is ever guessable", async () => {
    m.db.user.findUnique.mockResolvedValue(null);
    await sendEmailCode({ email: "a@b.co" }, request);
    const where = m.db.verificationToken.deleteMany.mock.calls[0][0].where;
    expect(where).toEqual({ identifier: "mobile-code:a@b.co" });
    expect(m.db.verificationToken.create).toHaveBeenCalledTimes(1);
  });
});
