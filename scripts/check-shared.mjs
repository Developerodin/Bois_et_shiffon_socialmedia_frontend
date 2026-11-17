// Fails when the shared contract copy was edited by hand or is older than the server's. Run before tsc (npm run typecheck).
// Must hash exactly like server scripts/sync-shared.mjs.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const LOCAL = "shared";

export function hashTree(dir) {
  const files = readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && e.name !== ".hash")
    .map((e) => path.relative(dir, path.join(e.parentPath, e.name)).replaceAll("\\", "/"))
    .sort();
  const hash = createHash("sha256");
  for (const f of files) hash.update(f).update("\0").update(readFileSync(path.join(dir, f))).update("\0");
  return hash.digest("hex");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const local = path.join(root, LOCAL);
  const digest = hashTree(local);
  const fail = (why) => {
    console.error(`check-shared: ${LOCAL} ${why} Run npm run sync:shared in the server repo.`);
    process.exit(1);
  };
  if (digest !== readFileSync(path.join(local, ".hash"), "utf8").trim()) fail("was edited by hand.");
  const serverHash = path.join(process.env.SERVER_DIR ?? path.join(root, "../server"), "shared/.hash");
  const hasServer = existsSync(serverHash);
  if (hasServer && readFileSync(serverHash, "utf8").trim() !== digest) fail("is older than the server's shared/.");
  console.log(`check-shared: ok ${digest}${hasServer ? "" : " (server repo not found: only the hand-edit check ran)"}`);
}
