import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { chromium, type FullConfig } from "@playwright/test";

export const ROLES = ["owner", "viewer", "admin"] as const;
export type Role = (typeof ROLES)[number];
export const authFile = (role: Role) => path.join(__dirname, ".auth", `${role}.json`);

/**
 * Signs each e2e account in once through /login and saves its session to e2e/.auth/<role>.json (git-ignored).
 * Login is rate-limited per email and IP, so the specs reuse these sessions instead of signing in again.
 * Credentials come from the environment only (apps/web/.env is loaded if present); see e2e/README.md.
 */
export default async function globalSetup(config: FullConfig) {
  const use = config.projects[0].use;
  const baseURL = use.baseURL ?? "";
  const host = new URL(baseURL).hostname;
  if (host !== "localhost" && host !== "127.0.0.1") {
    throw new Error(`e2e sign-in runs against a local dev server only, not ${host}.`);
  }

  const envFile = path.join(__dirname, "..", ".env");
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const creds = ROLES.map((role) => {
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
      const context = await browser.newContext({ baseURL });
      const page = await context.newPage();
      await page.goto("/login");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Password").fill(password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      try {
        await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 30_000 });
      } catch {
        throw new Error(`The ${role} account could not sign in (wrong password, or rate-limited).`);
      }
      await context.storageState({ path: authFile(role) });
      await context.close();
    }
  } finally {
    await browser.close();
  }
}
