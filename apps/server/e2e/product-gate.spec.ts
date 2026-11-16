import { expect, test } from "@playwright/test";
import { authFile } from "./global-setup";
import { SHELL_COOKIE_BRAND, SHELL_COOKIE_WORKSPACE } from "@espanda/shared";

/**
 * The approval gate on a post whose linked product is sold out. Needs a seeded post:
 * E2E_GATE_ITEM=<contentItemId> (scripts/_tmp/seed-gate.ts) and E2E_PRODUCTS_BRAND=<workspaceId>/<brandId>.
 */
test.setTimeout(180_000);
const item = process.env.E2E_GATE_ITEM;
const pick = process.env.E2E_PRODUCTS_BRAND?.split("/");
const shot = (name: string) => (process.env.E2E_SHOTS ? { path: `${process.env.E2E_SHOTS}/${name}.png`, fullPage: true } : undefined);

test.use({ storageState: authFile("owner"), viewport: { width: 1440, height: 900 } });

test("a sold-out product stops approval until someone approves anyway", async ({ page, context, baseURL }) => {
  test.skip(!item || pick?.length !== 2, "set E2E_GATE_ITEM and E2E_PRODUCTS_BRAND");
  await context.addCookies([
    { name: SHELL_COOKIE_WORKSPACE, value: pick![0], url: baseURL! },
    { name: SHELL_COOKIE_BRAND, value: pick![1], url: baseURL! },
  ]);
  await page.goto(`/?post=${item}`);
  const panel = page.getByRole("region", { name: "Approval and publishing" });
  await expect(panel).toBeVisible({ timeout: 60_000 });

  await expect(panel.getByRole("list", { name: "Issues" }).getByText('Chaise "Julia" is out of stock')).toBeVisible();
  await expect(panel.getByRole("button", { name: "Approve anyway" })).toBeVisible();
  await expect(panel.getByLabel(/^Note/)).toBeVisible();
  await expect(panel.getByRole("button", { name: "Ask for changes" })).toBeVisible();
  await expect(panel.getByRole("checkbox", { name: "Suggest another product" })).toBeChecked();
  // The plain approve steps aside while "Approve anyway" is offered.
  await expect(panel.getByRole("button", { name: /^Approve v\d+$/ })).toHaveCount(0);
  const before = shot("gate-before");
  if (before) await panel.screenshot({ path: before.path });

  await panel.getByLabel(/^Note/).fill("Restock arriving Friday");
  await panel.getByRole("button", { name: "Approve anyway" }).click();
  const history = panel.locator("li", { hasText: "Restock arriving Friday" });
  await expect(history).toContainText(/approved v\d+ anyway: Chaise "Julia"/, { timeout: 30_000 });
  // The header line reads "Instagram post · no date · Approved · draft v1".
  await expect(page.getByText(/· Approved · draft v\d+/)).toBeVisible();
  const after = shot("gate-after");
  if (after) await panel.screenshot({ path: after.path });
});
