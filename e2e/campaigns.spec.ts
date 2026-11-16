import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./global-setup";
import { SHELL_COOKIE_BRAND, SHELL_COOKIE_WORKSPACE } from "@espanda/shared";

/**
 * "Campaigns and offers" on /products (owner: create, edit, withdraw an offer; viewer: read-only), and, with
 * E2E_OFFER_ITEM=<contentItemId> (scripts/_tmp/seed-offer.ts), the ended-offer issue on that post's approval panel.
 * Needs E2E_PRODUCTS_BRAND=<workspaceId>/<brandId>. Leaves a withdrawn (archived) "Playwright flash" campaign and may
 * set the brand timezone to Europe/Paris: scripts/_tmp/unseed-offer.ts deletes and restores both.
 */
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
const pick = process.env.E2E_PRODUCTS_BRAND?.split("/");
const offerItem = process.env.E2E_OFFER_ITEM;
const NAME = "Playwright flash";
const shot = (name: string) => (process.env.E2E_SHOTS ? { path: `${process.env.E2E_SHOTS}/${name}.png`, fullPage: true } : undefined);

test.beforeEach(async ({ context, baseURL }) => {
  test.skip(pick?.length !== 2, "set E2E_PRODUCTS_BRAND");
  await context.addCookies([
    { name: SHELL_COOKIE_WORKSPACE, value: pick![0], url: baseURL! },
    { name: SHELL_COOKIE_BRAND, value: pick![1], url: baseURL! },
  ]);
});

/** Paris wall-clock "YYYY-MM-DD", "HH:MM" for an instant. */
function paris(ms: number) {
  const s = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(ms);
  return [s.slice(0, 10), s.slice(11, 16)] as const;
}

async function openSection(page: Page) {
  await page.goto("/products");
  const section = page.getByRole("region", { name: "Campaigns and offers" });
  await expect(section).toBeVisible({ timeout: 90_000 });
  return section;
}
const row = (section: ReturnType<Page["getByRole"]>) => section.getByRole("listitem").filter({ hasText: NAME });

test.describe("owner", () => {
  test.use({ storageState: authFile("owner"), viewport: { width: 1440, height: 900 } });

  test("creates an offer and sees it live", async ({ page }) => {
    const section = await openSection(page);
    const before = shot("campaigns-empty");
    if (before) await page.screenshot(before);
    await section.getByRole("button", { name: "New campaign" }).click();
    const dialog = page.getByRole("dialog", { name: "New campaign" });
    await expect(dialog).toBeVisible();
    // First save asks for the brand timezone.
    const zone = dialog.getByLabel(/Brand timezone/);
    if (await zone.count()) await zone.selectOption("Europe/Paris");
    await dialog.getByLabel("Kind").selectOption("offer");
    await dialog.getByLabel("Name", { exact: true }).fill(NAME);
    const [sd, st] = paris(Date.now() - 5 * 60_000);
    const [ed, et] = paris(Date.now() + 3 * 3600_000);
    await dialog.getByLabel("Start date", { exact: true }).fill(sd);
    await dialog.getByLabel("Start time", { exact: true }).fill(st);
    await dialog.getByLabel("End date", { exact: true }).fill(ed);
    await dialog.getByLabel("End time", { exact: true }).fill(et);
    await dialog.getByLabel("What customers get, and its conditions").fill("-20 % sur la chaise Julia");
    await dialog.getByLabel("Discount % (optional)").fill("25");
    await expect(dialog.getByText("The wording says 20 % but the discount is 25 %.", { exact: false })).toBeVisible();
    await dialog.getByLabel("Discount % (optional)").fill("20");
    await expect(dialog.getByText("The wording says", { exact: false })).toBeHidden();
    await dialog.getByLabel("Code (optional)").fill("PWFLASH20");
    const search = dialog.getByLabel("Search products");
    if (await search.count()) {
      await search.fill("julia");
      await expect(dialog.getByRole("checkbox", { name: 'Chaise "Julia"' })).toBeVisible();
    }
    await dialog.getByRole("checkbox", { name: 'Chaise "Julia"' }).check();
    const filled = shot("campaigns-dialog");
    if (filled) await dialog.screenshot({ path: filled.path });
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });

    await expect(section.getByText(`${NAME} saved.`)).toBeVisible();
    await expect(section.getByText("Times are in Paris (Central European Time).")).toBeVisible();
    const r = row(section);
    await expect(r).toHaveCount(1);
    await expect(r).toContainText("· Offer");
    await expect(r).not.toContainText("ended");
    await expect(r).toContainText("-20 % · code PWFLASH20");
    await expect(r).toContainText("1 product");
    const after = shot("campaigns-created");
    if (after) await page.screenshot(after);
  });
});

test.describe("viewer", () => {
  test.use({ storageState: authFile("viewer"), viewport: { width: 1440, height: 900 } });

  test("sees campaigns read-only", async ({ page }) => {
    const section = await openSection(page);
    await expect(row(section)).toHaveCount(1);
    await expect(section.getByRole("button", { name: "New campaign" })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Edit" })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Withdraw" })).toHaveCount(0);
    await expect(section.getByRole("button", { name: "Change" })).toHaveCount(0);
    const s = shot("campaigns-viewer");
    if (s) await page.screenshot(s);
  });
});

test.describe("owner", () => {
  test.use({ storageState: authFile("owner"), viewport: { width: 1440, height: 900 } });

  test("edits the offer, then withdraws it", async ({ page }) => {
    const section = await openSection(page);
    const r = row(section);
    await r.getByRole("button", { name: "Edit" }).click();
    const dialog = page.getByRole("dialog", { name: `Edit ${NAME}` });
    await expect(dialog).toBeVisible();
    const warning = dialog.getByRole("status").filter({ hasText: "use" });
    console.log(`affected-posts warning shown: ${await warning.count() > 0}`);
    if (await warning.count()) await expect(warning).toContainText("held until they’re rewritten");
    await dialog.getByLabel("Discount % (optional)").fill("25");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden({ timeout: 30_000 });
    await expect(r).toContainText("-25 % · code PWFLASH20");

    await r.getByRole("button", { name: "Withdraw" }).click();
    const confirm = page.getByRole("alertdialog").or(page.getByRole("dialog")).filter({ hasText: `Withdraw ${NAME}?` });
    await expect(confirm).toBeVisible();
    const c = shot("campaigns-withdraw-confirm");
    if (c) await page.screenshot(c);
    await confirm.getByRole("button", { name: "Withdraw" }).click();
    await expect(section.getByText(`${NAME} withdrawn.`)).toBeVisible({ timeout: 30_000 });
    await expect(row(section)).toHaveCount(0);
  });
});

test.describe("post with an ended offer", () => {
  test.use({ storageState: authFile("owner"), viewport: { width: 1440, height: 900 } });

  test("shows the offer and its ended issue, and approves anyway", async ({ page }) => {
    test.skip(!offerItem, "set E2E_OFFER_ITEM (scripts/_tmp/seed-offer.ts)");
    await page.goto(`/?post=${offerItem}`);
    const panel = page.getByRole("region", { name: "Approval and publishing" });
    await expect(panel).toBeVisible({ timeout: 90_000 });

    await expect(panel.getByText(/^Offer: Vente flash Playwright · -20 % · PWJULIA20 · .+ – .+ \(Paris\)$/)).toBeVisible({ timeout: 30_000 });
    const issues = panel.getByRole("list", { name: "Issues" });
    await expect(issues.getByText(/"Vente flash Playwright" ended .+\. Approve anyway or ask for changes\./)).toBeVisible();
    await expect(panel.getByRole("button", { name: "Approve anyway" })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Ask for changes" })).toBeVisible();
    await expect(panel.getByText("Suggest another product")).toHaveCount(0);
    await expect(panel.getByRole("button", { name: /^Approve v\d+$/ })).toHaveCount(0);
    const before = shot("offer-before");
    if (before) await panel.screenshot({ path: before.path });

    await panel.getByLabel(/^Note/).fill("Prolongée en magasin");
    await panel.getByRole("button", { name: "Approve anyway" }).click();
    const history = panel.locator("li", { hasText: "Prolongée en magasin" });
    await expect(history).toContainText(/approved v\d+ anyway/, { timeout: 30_000 });
    console.log(`history line: ${await history.first().innerText()}`);
    await expect(page.getByText(/· Approved · draft v\d+/)).toBeVisible();
    const after = shot("offer-after");
    if (after) await panel.screenshot({ path: after.path });
  });
});
