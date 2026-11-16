/**
 * Set an account's password from this machine, typed hidden at a prompt (never an argument, so it stays out of
 * shell history and logs). Signs the account out everywhere, like a reset does.
 *   npm run set-password -w web -- admin@cmo.local               (asks; shows * while typing)
 *   npm run set-password -w web -- admin@cmo.local --from-seed   (uses SEED_OWNER_PASSWORD from apps/web/.env)
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
        if (c === "\u007f" || c === "\b") {
          if (value) process.stdout.write("\b \b");
          value = value.slice(0, -1);
        } else {
          value += c;
          process.stdout.write("*"); // feedback without showing the password
        }
      }
    };
    stdin.on("data", onData);
  });
}

(async () => {
  const email = process.argv[2]?.trim().toLowerCase();
  const fromSeed = process.argv.includes("--from-seed");
  if (!email) throw new Error("Usage: npm run set-password -w web -- <email> [--from-seed]");
  if (!fromSeed && !process.stdin.isTTY) throw new Error("Run this in a terminal (it asks for the password), or add --from-seed.");
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new Error(`No account for ${email}`);

  const password = fromSeed ? (process.env.SEED_OWNER_PASSWORD ?? "") : await askHidden("New password: ");
  if (fromSeed && !password) throw new Error("SEED_OWNER_PASSWORD isn't set in apps/web/.env");
  const ok = Password.safeParse(password);
  if (!ok.success) throw new Error(ok.error.issues[0]?.message ?? "Password rejected");
  if (!fromSeed && (await askHidden("Type it again: ")) !== password) throw new Error("The two didn't match. Nothing changed.");

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(password, 12), sessionVersion: { increment: 1 } } });
  await prisma.auditEvent.create({ data: { actorUserId: user.id, action: "auth.password_set_locally", entityType: "User", entityId: user.id, metadata: {} } });
  console.log(`Password changed for ${email}${fromSeed ? " to SEED_OWNER_PASSWORD from apps/web/.env" : ""}. Other sessions are signed out.`);
})()
  .catch((e: unknown) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
