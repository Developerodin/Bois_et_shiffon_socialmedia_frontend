/**
 * Set an account's password from this machine, typed hidden at a prompt (never an argument, so it stays out of
 * shell history and logs). Signs the account out everywhere, like a reset does.
 *   npm run set-password -w web -- admin@cmo.local
 * For accounts whose email can't receive the reset link (local test accounts).
 */
import bcrypt from "bcryptjs";
import { prisma } from "@/server/db/prisma";
import { Password } from "@/server/services/accounts";

function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    process.stdout.write(question);
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let value = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode?.(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(value);
        }
        if (c === "\u0003") process.exit(130); // Ctrl+C
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

(async () => {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) throw new Error("Usage: npm run set-password -w web -- <email>");
  if (!process.stdin.isTTY) throw new Error("Run this in a terminal: it asks for the password with hidden typing.");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No account for ${email}`);

  const password = await askHidden("New password: ");
  const ok = Password.safeParse(password);
  if (!ok.success) throw new Error(ok.error.issues[0]?.message ?? "Password rejected");
  if ((await askHidden("Type it again: ")) !== password) throw new Error("The two didn't match. Nothing changed.");

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12), sessionVersion: { increment: 1 } } });
  await prisma.auditEvent.create({ data: { actorUserId: user.id, action: "auth.password_set_locally", entityType: "User", entityId: user.id, metadata: {} } });
  console.log(`Password changed for ${email}. Other sessions are signed out.`);
})()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
