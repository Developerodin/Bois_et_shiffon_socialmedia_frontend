/**
 * Who is a platform admin (User.isPlatformAdmin: Platform admin → AI models, /admin). Run by someone with database access;
 * there is deliberately no screen for it, since a platform admin sees every workspace.
 *   npm run platform-admin -w web -- list
 *   npm run platform-admin -w web -- create platform@example.com   a new account just for this, password printed once
 *   npm run platform-admin -w web -- grant person@example.com
 *   npm run platform-admin -w web -- revoke person@example.com
 * Each change is recorded as an AuditEvent (platform.admin_granted / platform.admin_revoked).
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/prisma";

const [command, rawEmail] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();

(async () => {
  if (command === "list") {
    const admins = await prisma.user.findMany({ where: { isPlatformAdmin: true }, select: { email: true, status: true } });
    console.log(admins.length ? admins.map((a) => `${a.email}${a.status === "ACTIVE" ? "" : ` (${a.status.toLowerCase()})`}`).join("\n") : "No platform admins.");
    return;
  }
  if (command === "create" && email) {
    // A separate sign-in for platform work, so people's own accounts (workspace owners/admins) stay just that.
    if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
      console.error(`${email} already has an account. Use: grant ${email}`);
      process.exitCode = 1;
      return;
    }
    const password = randomBytes(18).toString("base64url"); // 24 characters, shown once
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({ data: { email, name: "Platform admin", status: "ACTIVE", isPlatformAdmin: true, passwordHash: await bcrypt.hash(password, 12) } });
      await tx.auditEvent.create({ data: { action: "platform.admin_created", entityType: "User", entityId: u.id, metadata: { email, by: "npm run platform-admin" } } });
      return u;
    });
    console.log(`Created platform admin ${user.email}\nPassword (shown once, store it in a password manager): ${password}\nSign in at /login, then open Menu → Platform admin. Change it any time with "Forgot password".`);
    return;
  }
  if ((command !== "grant" && command !== "revoke") || !email) {
    console.error("Usage: npm run platform-admin -w web -- list | create <email> | grant <email> | revoke <email>");
    process.exitCode = 1;
    return;
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, isPlatformAdmin: true } });
  if (!user) {
    console.error(`No account for ${email}. They need to sign up first.`);
    process.exitCode = 1;
    return;
  }
  const on = command === "grant";
  if (user.isPlatformAdmin === on) {
    console.log(`${email} is ${on ? "already" : "not"} a platform admin.`);
    return;
  }
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { isPlatformAdmin: on } }),
    prisma.auditEvent.create({ data: { action: on ? "platform.admin_granted" : "platform.admin_revoked", entityType: "User", entityId: user.id, metadata: { email, by: "npm run platform-admin" } } }),
  ]);
  console.log(`${email} is ${on ? "now" : "no longer"} a platform admin.`);
})().finally(() => prisma.$disconnect());
