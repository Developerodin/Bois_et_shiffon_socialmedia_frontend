/**
 * Live login-hardening check against the running app (port 3100) + Neon:
 * rate limit, unknown-email timing, session revocation, disabled accounts.
 * Run with the app started: npm run smoke:auth -w web
 */
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/prisma";
import { limitKey, resetRateLimit } from "@/server/auth/rate-limit";

const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3100";

async function login(email: string, password: string, ip: string) {
  const jar = new Map<string, string>();
  const keep = (r: Response) => {
    for (const c of r.headers.getSetCookie()) {
      const kv = c.split(";")[0];
      const i = kv.indexOf("=");
      jar.set(kv.slice(0, i), kv.slice(i + 1));
    }
  };
  const cookie = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  let r = await fetch(`${base}/api/auth/csrf`);
  keep(r);
  const { csrfToken } = (await r.json()) as { csrfToken: string };
  const started = Date.now();
  r = await fetch(`${base}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: cookie(), "x-forwarded-for": ip },
    body: new URLSearchParams({ csrfToken, email, password, callbackUrl: `${base}/` }),
  });
  keep(r);
  const ms = Date.now() - started;
  const location = r.headers.get("location") ?? "";
  const ok = [...jar.keys()].some((k) => k.includes("session-token"));
  return { ok, ms, location, me: () => fetch(`${base}/api/v1/me`, { headers: { cookie: cookie() } }) };
}

async function main() {
  const email = `smoke-auth-${Date.now()}@example.com`;
  const password = "correct horse battery staple";
  const user = await prisma.user.create({
    data: { email, name: "Smoke Auth", passwordHash: await bcrypt.hash(password, 12) },
  });
  const ip = `203.0.113.${Math.floor(Math.random() * 200) + 1}`;
  try {
    // 1. good login + session works
    const good = await login(email, password, ip);
    assert.ok(good.ok, "login should succeed");
    assert.equal((await good.me()).status, 200);
    console.log("1 valid login → session ✓");

    // 2. revocation: bump sessionVersion → existing session rejected
    await prisma.user.update({ where: { id: user.id }, data: { sessionVersion: { increment: 1 } } });
    assert.equal((await good.me()).status, 401, "revoked session must be rejected");
    console.log("2 sessionVersion bump revokes existing session ✓");

    // 3. timing: unknown email vs wrong password within the same order of magnitude
    const wrong = await login(email, "nope", ip);
    const unknown = await login(`nobody-${Date.now()}@example.com`, "nope", ip);
    assert.ok(!wrong.ok && !unknown.ok);
    assert.ok(unknown.ms > wrong.ms * 0.5, `unknown ${unknown.ms}ms vs wrong ${wrong.ms}ms`);
    console.log(`3 no enumeration by timing: wrong ${wrong.ms}ms, unknown ${unknown.ms}ms ✓`);

    // 4. rate limit per email (5 / 15 min; 1 wrong already counted above)
    let last = wrong;
    for (let i = 0; i < 5; i++) last = await login(email, "nope", ip);
    assert.ok(last.location.includes("rate_limited") || last.location.includes("code=rate_limited"), `got ${last.location}`);
    const blockedEvenIfRight = await login(email, password, ip);
    assert.ok(!blockedEvenIfRight.ok, "correct password must also be blocked while limited");
    // Someone hammering from one place can't lock the real person out from theirs.
    assert.ok((await login(email, password, `${ip}8`)).ok, "the owner signs in from another IP");
    console.log("4 rate limit blocks after 5 failures from one IP, without locking the account out elsewhere ✓");

    // 5. disabled account cannot sign in
    await resetRateLimit(limitKey("login:email", email));
    await prisma.user.update({ where: { id: user.id }, data: { status: "DISABLED" } });
    assert.ok(!(await login(email, password, `${ip}9`)).ok, "disabled user must not sign in");
    console.log("5 disabled account rejected ✓");
  } finally {
    await resetRateLimit(limitKey("login:email", email));
    for (const i of [ip, `${ip}8`, `${ip}9`]) await resetRateLimit(limitKey("login:email-ip", `${email}|${i}`));
    await prisma.user.delete({ where: { id: user.id } });
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
