import path from "node:path";
import { expect as baseExpect, test, type Page, type Route } from "@playwright/test";
import { authFile } from "./global-setup";
import type { QuoteDto } from "@/shared";

/**
 * The screens from the CRM tier 1 merge (Quotes, Blog, Weekly digest, the Sales tab, the Shopify connect dialog, and the
 * Pulse and Hum agent slots) at a phone, a tablet and a desktop width, as the owner: nothing wider than the window, the
 * key parts visible, and the empty states. Read-only against a shared database: nothing is created, saved or connected;
 * lists that need fixed contents (an empty list, a filled one, Shopify's connect options) are answered here in the browser.
 * Blog and the digest are behind flags; when theirs is off the page is the app's not-found page and the test skips.
 * Owner only: `E2E_ROLES=owner`. Screenshots go to e2e/screenshots/ (git-ignored).
 */
test.use({ storageState: authFile("owner") });
// The dev server compiles each route on its first visit; one wait for everything this spec looks for.
test.setTimeout(180_000);
const expect = baseExpect.configure({ timeout: 60_000 });

const SIZES = [
  { name: "390", width: 390, height: 844 },
  { name: "820", width: 820, height: 1180 },
  { name: "1500", width: 1500, height: 900 },
] as const;
const SHOTS = path.join(__dirname, "screenshots");

async function noSideways(page: Page) {
  // The window, and <main> (the shell's own scroller): neither scrolls sideways.
  await expect.poll(() => page.evaluate(() => document.scrollingElement!.scrollWidth <= window.innerWidth)).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const main = document.getElementById("content");
        return !main || main.scrollWidth <= main.clientWidth;
      }),
    )
    .toBe(true);
}
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, `${name}.png`), fullPage: true });
/** Opens a page; skips the test when its flag is off (the route answers with the app's not-found page). */
async function open(page: Page, url: string) {
  const res = await page.goto(url);
  const notFound = res?.status() === 404 || (await page.getByRole("heading", { name: /This page doesn.t exist/, level: 1 }).count()) > 0;
  test.skip(notFound, `${url} is behind a flag that is off`);
}

const day = "2026-11-20T10:00:00.000Z";
function quote(n: number, over: Partial<QuoteDto> = {}): QuoteDto {
  return {
    id: `q${n}`,
    number: `Q-000${n}`,
    status: "DRAFT",
    version: 1,
    contactName: "Jeanne Martin",
    contactEmail: "jeanne@client.test",
    currency: "EUR",
    lines: [
      { productId: "p1", variantId: "v1", title: "Linen sofa cover, natural, three seats", quantity: 2, unitPrice: "1000.00" },
      { productId: null, variantId: null, title: "Delivery", quantity: 1, unitPrice: "80.00" },
    ],
    discount: { kind: "PERCENT", value: "10" },
    totals: { subtotal: "2080.00", discount: "208.00", total: "1872.00" },
    note: "Delivery in May.",
    internalNote: null,
    validUntil: null,
    shopifyName: null,
    needsShopifyUpdate: false,
    shopifySubtotal: null,
    subtotalDiffers: false,
    subtotalAccepted: false,
    invoiceUrl: null,
    sentAt: null,
    createdById: null,
    createdAt: day,
    updatedAt: day,
    ...over,
  } satisfies QuoteDto;
}
const QUOTES = [
  quote(1),
  quote(2, { status: "SENT", shopifyName: "#D12", validUntil: "2026-12-20", contactName: "Maison Dupont-Lefèvre et Associés, intérieurs" }),
  quote(3, { status: "CREATED", shopifyName: "#D13", contactName: null, lines: [], totals: { subtotal: "0.00", discount: "0.00", total: "0.00" }, discount: null }),
];
/** Answers the quotes list (GET only) with `quotes`; any other call to it is refused, so nothing is written. */
const listQuotes = (page: Page, quotes: QuoteDto[]) =>
  page.route(/\/api\/v1\/workspaces\/[^/]+\/brands\/[^/]+\/quotes(\?.*)?$/, (route: Route) =>
    route.request().method() === "GET" ? route.fulfill({ json: { quotes } }) : route.abort(),
  );
/** The sidebar's links: in the Menu sheet when the window is too narrow for the docked sidebar. */
async function sidebar(page: Page) {
  const menu = page.getByRole("button", { name: "Menu" });
  if (await menu.isVisible()) await menu.click();
  return page.getByRole("navigation", { name: "Workspace" }).last();
}

for (const size of SIZES) {
  test.describe(`at ${size.name}px`, () => {
    test.use({ viewport: { width: size.width, height: size.height } });

    test("Quotes smoke check on the stored data", async ({ page }) => {
      await open(page, "/crm");
      await expect(page.getByRole("heading", { name: "Quotes", level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: /^(All quotes|No quotes yet)$/ })).toBeVisible();
      await noSideways(page);
      await shot(page, `quotes-${size.name}`);
    });

    test("Quotes: the empty state offers New quote", async ({ page }) => {
      await listQuotes(page, []);
      await open(page, "/crm");
      const empty = page.locator("div").filter({ has: page.getByRole("heading", { name: "No quotes yet", level: 2 }) }).last();
      await expect(empty).toBeVisible();
      await expect(empty.getByRole("button", { name: "New quote" })).toBeVisible();
      await noSideways(page);
      await shot(page, `quotes-empty-${size.name}`);
    });

    test("Quotes: list and a quote open", async ({ page }) => {
      await listQuotes(page, QUOTES);
      await open(page, "/crm");
      const list = page.getByRole("region", { name: "All quotes" });
      await expect(list).toBeVisible();
      await expect(list.getByRole("button")).toHaveCount(3);
      await expect(page.getByRole("heading", { name: "No quote open" })).toBeVisible();
      await expect(page.getByRole("button", { name: "New quote" })).toBeEnabled();
      await noSideways(page);
      await shot(page, `quotes-list-${size.name}`);
      await list.getByRole("button").first().click();
      // One h2 for the quote: the customer preview inside it is a lower heading.
      await expect(page.getByRole("heading", { name: "Quote Q-0001", level: 2 })).toBeInViewport();
      await expect(page.getByRole("heading", { name: "Quote Q-0001", level: 4 })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Line title" }).first()).toBeVisible();
      await noSideways(page);
      await shot(page, `quotes-detail-${size.name}`);
      await list.getByRole("button").nth(1).click();
      await expect(page.getByRole("heading", { name: "Quote Q-0002", level: 2 })).toBeVisible();
      await noSideways(page);
    });

    test("Blog", async ({ page }) => {
      await open(page, "/blog");
      await expect(page.getByRole("heading", { name: "Blog", level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: /^(Articles|No articles yet)$/ })).toBeVisible();
      await noSideways(page);
      await shot(page, `blog-${size.name}`);
    });

    test("Weekly digest", async ({ page }) => {
      await open(page, "/digest");
      await expect(page.getByRole("heading", { name: "Weekly digest", level: 1 })).toBeVisible();
      await expect(page.getByRole("heading", { name: /^(Week of |No digest yet)/ }).first()).toBeVisible();
      await noSideways(page);
      await shot(page, `digest-${size.name}`);
    });

    test("Sales tab", async ({ page }) => {
      await open(page, "/performance?tab=sales");
      // The Sales section (figures, or how to turn orders on), once nothing in it is still loading.
      const sales = page.getByRole("region", { name: "Sales", exact: true });
      await expect(sales).toBeVisible();
      await expect(sales.locator('[aria-busy="true"]')).toHaveCount(0);
      await noSideways(page);
      await shot(page, `sales-${size.name}`);
    });

    test("Shopify connect dialog shows AskCart and Shopify MCP", async ({ page }) => {
      // Shopify offered with both ways set up, and no store yet, so the row offers Connect. Only the list is changed.
      await page.route(/\/api\/v1\/workspaces\/[^/]+\/brands\/[^/]+\/connections(\?.*)?$/, async (route) => {
        if (route.request().method() !== "GET") return route.abort();
        const res = await route.fetch();
        const body = (await res.json()) as { providers: { provider: string }[]; connections: { provider: string }[] };
        const shopify = { provider: "SHOPIFY", label: "Shopify", configured: true, kind: "token", askCart: "per-brand", mcp: true };
        body.providers = [...body.providers.filter((p) => p.provider !== "SHOPIFY"), shopify];
        body.connections = body.connections.filter((c) => c.provider !== "SHOPIFY");
        await route.fulfill({ response: res, json: body });
      });
      await open(page, "/connections");
      const row = page.getByRole("listitem").filter({ has: page.getByText("Shopify", { exact: true }) });
      await row.getByRole("button", { name: "Connect" }).click();
      const dialog = page.getByRole("dialog", { name: "Connect Shopify" });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText("Connect with our app (AskCart)")).toBeVisible();
      await expect(dialog.getByRole("button", { name: "Connect with Shopify MCP" })).toBeVisible();
      const box = await dialog.boundingBox();
      expect(box && box.x >= 0 && box.x + box.width <= size.width).toBe(true);
      await noSideways(page);
      await shot(page, `shopify-dialog-${size.name}`);
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    });

    test("Pulse and Hum slots open the Sales tab and Members", async ({ page }) => {
      await page.goto("/products");
      const pulse = (await sidebar(page)).getByRole("link", { name: /^Pulse/ });
      await expect(pulse).toHaveAttribute("href", "/performance?tab=sales");
      await expect(pulse).not.toContainText("Soon");
      await shot(page, `agent-slots-${size.name}`);
      await pulse.click();
      await expect(page).toHaveURL(/\/performance\?tab=sales/);
      await expect(page.getByRole("region", { name: "Sales", exact: true })).toBeVisible();
      const hum = (await sidebar(page)).getByRole("link", { name: /^Hum/ });
      await expect(hum).toHaveAttribute("href", "/settings?tab=members");
      await hum.click();
      await expect(page).toHaveURL(/\/settings\?tab=members/);
      await noSideways(page);
      await shot(page, `hum-members-${size.name}`);
    });
  });
}
