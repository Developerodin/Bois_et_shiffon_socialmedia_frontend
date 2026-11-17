// Fails if this app's build output (.next) carries the Prisma client or the name of a Server secret.
// Run after `npm run build` with an empty env. Secret names: a fixed core list plus every name in the server repo's
// .env.example (checked out next to this one, or at SERVER_DIR) that looks like a secret, so a new one is covered once
// it is added there. Without the server repo only the core list is checked, and the script says so.
// .next/cache is skipped: it is the compiler's cache of raw module sources (comments included, e.g. Auth.js's error docs
// naming AUTH_SECRET in next-auth/react's imports) and is never deployed. Everything that ships is checked.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, ".next");
const serverExample = path.resolve(root, process.env.SERVER_DIR ?? "../server", ".env.example");
if (!existsSync(out)) {
  console.error("check-bundle: .next is missing; run `npm run build` first.");
  process.exit(1);
}

const CORE = ["DATABASE_URL", "AUTH_SECRET", "GOOGLE_CLIENT_SECRET", "OPENAI_API_KEY", "STORAGE_SECRET_ACCESS_KEY", "CRON_SECRET"];
if (!existsSync(serverExample)) console.warn(`check-bundle: ${serverExample} not found; checking the core secret names only.`);
const example = existsSync(serverExample) ? readFileSync(serverExample, "utf8") : "";
const listed = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((m) => m[1]).filter((n) => /SECRET|PASSWORD|_KEY|TOKEN|_PASS$|DATABASE_URL/.test(n));
const needles = ["PrismaClient", ...new Set([...CORE, ...listed])];

const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(path.join(dir, d.name)) : [path.join(dir, d.name)]));
const files = readdirSync(out, { withFileTypes: true }).flatMap((d) => (d.name === "cache" ? [] : d.isDirectory() ? walk(path.join(out, d.name)) : [path.join(out, d.name)]));
const hits = [];
for (const file of files) {
  const text = readFileSync(file, "latin1");
  for (const needle of needles) if (text.includes(needle)) hits.push(`${path.relative(root, file)}: ${needle}`);
}

if (hits.length) {
  console.error(`check-bundle: ${hits.length} hit(s) in .next:\n${hits.join("\n")}`);
  process.exit(1);
}
console.log(`check-bundle: ${files.length} files in .next (cache skipped) carry no PrismaClient and none of ${needles.length - 1} secret names.`);
