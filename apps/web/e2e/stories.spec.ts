import { execSync } from "node:child_process";
import { expect, test } from "@playwright/test";
import { authFile } from "./global-setup";
import { SHELL_COOKIE_BRAND, SHELL_COOKIE_WORKSPACE } from "@espanda/shared";

/**
 * Stories on the web. Part 1: a seeded 4-frame photo story waits for approval; open it from the calendar, see its frames
 * (read-only), approve it. Part 2: a seeded approved story is set to be posted by hand at a past time, shows as due on
 * Today, its zip downloads, and "I posted it" publishes it. scripts/seed-story.ts makes the stories through the server
 * code path (photos from the brand, no AI calls) and removes them afterwards. Needs the dev Bois & Chiffons brand.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
test.use({ storageState: authFile("owner"), viewport: { width: 1440, height: 900 } });

const tsx = (...args: string[]) => execSync(`npx tsx --conditions=react-server --env-file=.env scripts/seed-story.ts ${args.join(" ")}`, { cwd: process.cwd(), encoding: "utf8" });
const shot = (name: string) => (process.env.E2E_SHOTS ? { path: `${process.env.E2E_SHOTS}/${name}.png` } : undefined);
type Seeded = { itemId: string; workspaceId: string; brandId: string };
let seeded: Seeded;
let approved: Seeded | undefined;
const seed = (...args: string[]): Seeded => JSON.parse(tsx(...args).trim().split("\n").pop()!);

test.beforeAll(() => {
  seeded = seed();
});
test.afterAll(() => {
  if (seeded) tsx("--remove", seeded.itemId);
  if (approved) tsx("--remove", approved.itemId);
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

test("an approved story is posted by hand: due on Today, zip, I posted it", async ({ page }) => {
  // Seeded here, not in beforeAll, so part 1's calendar shows only its own story.
  approved = seed("--status", "approved");
  const id = approved.itemId;
  await page.goto(`/?post=${id}`);
  const panel = page.getByRole("region", { name: "Approval and publishing" });
  // An hour ago (local time), so it is due at once.
  const past = new Date(Date.now() - 3600_000 - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  await panel.getByLabel("Post by hand at").fill(past, { timeout: 90_000 });
  await panel.getByRole("button", { name: "Post by hand" }).click();
  await expect(panel.getByText(/Post by hand · /)).toBeVisible({ timeout: 30_000 });

  // Today: one card with the count of due stories; dismissing hides it in this browser.
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.goto("/");
  const due = page.getByRole("region", { name: "Stories to post by hand" });
  await expect(due).toBeVisible({ timeout: 60_000 });
  await expect(due).toContainText(/\d+ stor(y|ies) to post by hand/);
  await due.getByRole("button", { name: "Dismiss" }).click();
  await expect(due).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("region", { name: "Stories to post by hand" })).toHaveCount(0);

  await page.goto(`/?post=${id}`);
  const zip = page.waitForResponse((r) => r.url().includes(`/stories/${id}/package`));
  await panel.getByRole("button", { name: "Download frames" }).click({ timeout: 60_000 });
  const res = await zip;
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toBe("application/zip");
  await expect(panel.getByRole("alert")).toHaveCount(0);

  await panel.getByRole("button", { name: "I posted it" }).click();
  await expect(page.getByText(/· Published · /)).toBeVisible({ timeout: 30_000 });
});
