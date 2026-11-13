import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { authFile } from "./global-setup";
import { SHELL_COOKIE_BRAND, SHELL_COOKIE_WORKSPACE } from "../lib/shell-cookies";

/**
 * Stories on the web (part 1): a seeded 4-frame photo story waits for approval; open it from the calendar, see its frames
 * (read-only), approve it. scripts/seed-story.ts makes the story through the server code path (photos from the brand,
 * no AI calls) and removes it afterwards. Needs the dev Bois & Chiffons brand.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
test.use({ storageState: authFile("owner"), viewport: { width: 1440, height: 900 } });

const tsx = (...args: string[]) => execSync(`npx tsx --env-file=.env scripts/seed-story.ts ${args.join(" ")}`, { cwd: process.cwd(), encoding: "utf8" });
const shot = (name: string) => (process.env.E2E_SHOTS ? { path: `${process.env.E2E_SHOTS}/${name}.png` } : undefined);
let seeded: { itemId: string; workspaceId: string; brandId: string };

test.beforeAll(() => {
  seeded = JSON.parse(tsx().trim().split("\n").pop()!);
});
test.afterAll(() => {
  if (seeded) tsx("--remove", seeded.itemId);
});
test.beforeEach(async ({ context, baseURL }) => {
  await context.addCookies([
    { name: SHELL_COOKIE_WORKSPACE, value: seeded.workspaceId, url: baseURL! },
    { name: SHELL_COOKIE_BRAND, value: seeded.brandId, url: baseURL! },
  ]);
});

test("a story opens from the calendar with its frames, and can be approved", async ({ page }) => {
  await page.goto("/?panel=content");
  const row = page.getByRole("button", { name: /Seeded story/ });
  await expect(row).toBeVisible({ timeout: 90_000 });
  await expect(row).toContainText("Instagram story");
  await row.click();

  const frames = page.getByRole("region", { name: "Story frames" });
  await expect(frames).toBeVisible({ timeout: 60_000 });
  await expect(frames.getByRole("img")).toHaveCount(4, { timeout: 30_000 });
  // No editor for stories; the phone edits them.
  await expect(page.getByRole("heading", { name: /^Edit draft/ })).toHaveCount(0);
  await expect(frames.getByRole("button", { name: /^Edit/ })).toHaveCount(0);
  await expect(page.getByText("Edit on the phone")).toBeVisible();

  const panel = page.getByRole("region", { name: "Approval and publishing" });
  await expect(panel.getByRole("button", { name: /^Approve v\d+$/ })).toBeVisible({ timeout: 60_000 });
  // Pictures loaded (not just present) before the screenshot.
  await expect.poll(() => frames.locator("img").evaluateAll((els) => els.every((e) => (e as HTMLImageElement).naturalWidth > 0))).toBe(true);
  await frames.locator("img").evaluateAll((els) => Promise.all(els.map((e) => (e as HTMLImageElement).decode())));
  await page.waitForTimeout(500);
  const before = shot("task-12-panel");
  if (before) await frames.screenshot(before);
  await panel.getByRole("button", { name: /^Approve v\d+$/ }).click();
  await expect(page.getByText(/· Approved · draft v\d+/)).toBeVisible({ timeout: 30_000 });
});
