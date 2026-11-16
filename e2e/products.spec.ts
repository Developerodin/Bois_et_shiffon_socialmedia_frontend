import { expect, test } from "@playwright/test";
import { authFile } from "./global-setup";
import { SHELL_COOKIE_BRAND, SHELL_COOKIE_WORKSPACE } from "@espanda/shared";

test.describe.configure({ mode: "serial" });
// The dev server compiles each route on its first visit; give these pages time.
test.setTimeout(180_000);

/**
 * Optional: E2E_PRODUCTS_BRAND=<workspaceId>/<brandId> opens that business (one with a website or Shopify, so
 * there's a catalogue to sync and edit). Without it the tests use the account's current business.
 */
const pick = process.env.E2E_PRODUCTS_BRAND?.split("/");
test.beforeEach(async ({ context, baseURL }) => {
  if (pick?.length !== 2 || !baseURL) return;
  await context.addCookies([
    { name: SHELL_COOKIE_WORKSPACE, value: pick[0], url: baseURL },
    { name: SHELL_COOKIE_BRAND, value: pick[1], url: baseURL },
  ]);
});

// Screenshots for a person to look at; set E2E_SHOTS to a folder to keep them.
const shot = (name: string) => (process.env.E2E_SHOTS ? { path: `${process.env.E2E_SHOTS}/${name}.png`, fullPage: true } : undefined);

test.describe("owner", () => {
  test.use({ storageState: authFile("owner"), viewport: { width: 1440, height: 900 } });

  test("products page lists the catalogue and syncs it", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();
    // Wait for the list: the source line shows once it has loaded.
    await expect(page.getByText(/From your|No synced source/)).toBeVisible({ timeout: 60_000 });
    const sync = page.getByRole("button", { name: "Sync now" });
    if (await sync.isVisible()) {
      await sync.click();
      // The page polls the sync status, then reloads the list once the sync is done.
      await expect(page.getByRole("button", { name: "Syncing…" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sync now" })).toBeEnabled({ timeout: 150_000 });
      await expect(page.getByText(/Last synced (just now|1 min ago).*product/)).toBeVisible();
    }
    // Thumbnails load (small CDN renditions), and search narrows the list.
    const thumb = page.locator("tbody img").first();
    if (await thumb.count()) await expect.poll(() => thumb.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { timeout: 30_000 }).toBe(true);
    const first = (await page.locator("tbody tr").first().locator("td").nth(1).innerText()).trim();
    if (first && first !== "—") {
      await page.getByRole("searchbox", { name: "Search products" }).fill(first);
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await page.getByRole("searchbox", { name: "Search products" }).fill("");
    }
    const opts = shot("products");
    if (opts) await page.screenshot(opts);
  });

  test("person-owned facts can be edited on a synced product", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByText(/From your|No synced source/)).toBeVisible({ timeout: 60_000 });
    const firstRow = page.locator("tbody tr").first();
    test.skip((await firstRow.count()) === 0, "this business has no products");
    // Follow this one product by its name: saving re-sorts the list (newest edit first).
    const name = (await firstRow.locator("td").first().innerText()).split("\n")[0].trim();
    const row = page.locator("tbody tr", { hasText: name }).first();
    const note = `Playwright check ${Date.now()}`;
    await row.getByRole("button", { name: "Edit" }).click();
    const materials = page.getByLabel("Materials");
    const before = await materials.inputValue();
    await materials.fill(note);
    const opts = shot("product-edit");
    if (opts) await page.screenshot(opts);
    await page.getByRole("button", { name: "Save" }).click();
    // Saving reloads the whole list (~1,400 rows on the test business): allow for it.
    await expect(row.getByText(note)).toBeVisible({ timeout: 30_000 });
    // Put the original value back.
    await row.getByRole("button", { name: "Edit" }).click();
    await page.getByLabel("Materials").fill(before);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText(note)).toHaveCount(0, { timeout: 30_000 });
  });

  test("Shopify connect refuses an address outside myshopify.com", async ({ page }) => {
    await page.goto("/connections");
    await page.locator("li", { has: page.getByText("Shopify", { exact: true }) }).getByRole("button", { name: /^(re)?connect$/i }).click();
    const dialog = page.getByRole("dialog", { name: "Connect Shopify" });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Store address").fill("evil.example.com");
    await dialog.getByLabel("Admin API access token").fill("shpat_not_a_real_token");
    await dialog.getByRole("button", { name: "Connect" }).click();
    await expect(dialog.getByText(/myshopify\.com/i).last()).toBeVisible();
    const opts = shot("shopify-connect");
    if (opts) await page.screenshot(opts);
  });
});

test.describe("viewer", () => {
  test.use({ storageState: authFile("viewer"), viewport: { width: 1440, height: 900 } });

  test("sees the catalogue read-only", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Products", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sync now" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Add product" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit" })).toHaveCount(0);
  });
});
