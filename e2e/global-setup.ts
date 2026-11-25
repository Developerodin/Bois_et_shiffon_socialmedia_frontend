import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { chromium, type FullConfig } from "@playwright/test";

export const ROLES = ["owner", "viewer", "admin"] as const;
export type Role = (typeof ROLES)[number];
export const authFile = (role: Role) => path.join(__dirname, ".auth", `${role}.json`);
/** Run settings read from the shell only, never taken from the server's .env. */
const RUN_ONLY = new Set(["E2E_ROLES", "E2E_REUSE_AUTH"]);
/** How long a saved session is reused under E2E_REUSE_AUTH=1 (well inside the session's own lifetime). */
const REUSE_FOR_MS = 12 * 60 * 60 * 1000;
/** The server repo's checkout: next to this one (../server) unless SERVER_DIR says otherwise. */
export const SERVER_DIR = path.resolve(__dirname, "..", process.env.SERVER_DIR ?? "../server");

/**
 * The roles this run signs in: all three, unless E2E_ROLES names some (`E2E_ROLES=owner` for specs that use only the owner,
 * when the other accounts don't exist on this database). Read from the shell only, never from the server's .env: it picks
 * this run's specs, it isn't an account setting. The saved sessions of roles left out are deleted, so a spec that needs one
 * fails on the missing file instead of running on an old session.
 */
export function rolesToSignIn(): Role[] {
  const wanted = (process.env.E2E_ROLES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!wanted.length) return [...ROLES];
  const unknown = wanted.filter((r) => !(ROLES as readonly string[]).includes(r));
  if (unknown.length) throw new Error(`E2E_ROLES names unknown roles: ${unknown.join(", ")} (use ${ROLES.join(", ")}).`);
  return ROLES.filter((r) => wanted.includes(r));
}

/**
 * Signs each e2e account in once through /login and saves its session to e2e/.auth/<role>.json (git-ignored).
 * Login is rate-limited per email and IP, so the specs reuse these sessions instead of signing in again.
 * Credentials come from the environment only (E2E_* from the server repo's .env if present); see e2e/README.md.
 */
export default async function globalSetup(config: FullConfig) {
  const use = config.projects[0].use;
  const baseURL = use.baseURL ?? "";
  const host = new URL(baseURL).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`e2e sign-in runs against a local dev server only, not ${host}.`);
  }

  // The e2e accounts sit with the dev seed accounts in the Server's env file; only the E2E_* names are taken from it,
  // so none of the Server's secrets reach this process.
  const envFile = path.join(SERVER_DIR, ".env");
  if (existsSync(envFile)) {
    for (const [name, value] of Object.entries(parseEnv(readFileSync(envFile, "utf8")))) {
      if (name.startsWith("E2E_") && !RUN_ONLY.has(name) && process.env[name] === undefined) process.env[name] = value;
    }
  }

  const roles = rolesToSignIn();
  for (const role of ROLES) if (!roles.includes(role)) rmSync(authFile(role), { force: true });
  const reuse = process.env.E2E_REUSE_AUTH === "1";
  const creds = roles.map((role) => {
    const key = role.toUpperCase();
    const email = process.env[`E2E_${key}_EMAIL`];
    const password = process.env[`E2E_${key}_PASSWORD`];
    if (!email || !password) throw new Error(`Set E2E_${key}_EMAIL and E2E_${key}_PASSWORD (see e2e/README.md).`);
    return { role, email, password };
  });

  mkdirSync(path.join(__dirname, ".auth"), { recursive: true });
  const browser = await chromium.launch({ channel: use.channel });
  try {
    for (const { role, email, password } of creds) {
      // Login is rate-limited: with E2E_REUSE_AUTH=1 a session saved in the last 12 hours is used again, not signed in anew.
      if (reuse && existsSync(authFile(role)) && Date.now() - statSync(authFile(role)).mtimeMs < REUSE_FOR_MS) continue;
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      // Exact: the toggle beside the field is named "Show password".
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      try {
        await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
      } catch {
        // The form's own message says which: a wrong password, too many tries, or the sign-in service.
        const said = (await page.locator("form").getByRole("alert").allInnerTexts().catch(() => [])).join(" ").trim();
        throw new Error(`The ${role} account could not sign in${said ? `: "${said}"` : " (wrong password, or rate-limited)"}.`);
      }
      await context.storageState({ path: authFile(role) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
