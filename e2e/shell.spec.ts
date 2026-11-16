import { expect, test, type Page } from "@playwright/test";
import { authFile } from "./global-setup";

test.describe.configure({ mode: "serial" });

const MAIN = ["Overview", "Business context", "Connections"];
const AGENTS = ["Spark", "Beat", "Wave", "Echo", "Pulse", "Hum", "Surge", "Drift"];
// lib/nav.ts: the four placeholder agents, plus Echo (no web inbox yet).
const SOON = ["Spark", "Beat", "Echo", "Pulse", "Hum"];
const CONNECT_BUTTON = /^(re)?connect\b|^disconnect\b/i;
const MORE = ["Calendar", "Performance", "Agent log", "Settings"];

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Workspace" });
/** A sidebar row by its label; agent rows also read their "Soon" tag and role. */
const navLink = (page: Page, name: string) => sidebar(page).getByRole("link", { name: new RegExp(`^${name}( |$)`) });
const panel = (page: Page) => page.getByRole("complementary", { name: "Espanda" });
const accountMenu = (page: Page) => page.getByRole("button", { name: "Account menu" });

async function openAccountMenu(page: Page) {
  await accountMenu(page).click();
  await expect(page.getByRole("menu")).toBeVisible();
}

test.describe("owner", () => {
  test.use({ storageState: authFile("owner"), viewport: { width: 1440, height: 900 } });

  test("sidebar lists the main pages and the eight agents", async ({ page }) => {
    await page.goto("/connections");
    const nav = sidebar(page);
    for (const name of MAIN) await expect(nav.getByRole("link", { name, exact: true })).toBeVisible();
    for (const name of AGENTS) {
      const row = navLink(page, name);
      await expect(row).toBeVisible();
      if (SOON.includes(name)) await expect(row.getByText("Soon", { exact: true })).toBeVisible();
      else await expect(row.getByText("Soon", { exact: true })).toHaveCount(0);
    }
  });

  test("every sidebar and account-menu entry opens a page", async ({ page }) => {
    await page.goto("/connections");
    const names = [...MAIN, ...AGENTS];
    for (const name of names) {
      const link = navLink(page, name);
      const href = await link.getAttribute("href");
      await link.click();
      await page.waitForURL((u) => `${u.pathname}${u.search}` === href);
      await expect(page.getByRole("main"), `${name} → ${href}`).toBeVisible();
    }
    for (const name of MORE) {
      await openAccountMenu(page);
      const item = page.getByRole("menuitem", { name, exact: true });
      const href = await item.getAttribute("href");
      await item.click();
      await page.waitForURL((u) => `${u.pathname}${u.search}` === href);
      await expect(page.getByRole("main"), `${name} → ${href}`).toBeVisible();
    }
  });

  test("the workspace at / has no chat column of its own", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Agents", level: 2 })).toBeVisible();
    await expect(page.getByRole("region", { name: "Chat", exact: true })).toHaveCount(0);
    await expect(panel(page).getByRole("textbox")).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Message (Espanda|your CMO)$/ })).toHaveCount(1);
  });

  test("switching business moves the panel to the new business and drops the old thread", async ({ page }) => {
    await page.goto("/connections");
    const switcher = page.getByRole("button", { name: "Select business" });
    await switcher.click();
    const names = (await page.getByRole("menuitem").allInnerTexts()).map((t) => t.trim());
    await page.keyboard.press("Escape");

    // The switcher shows the business's initial, then its name; the panel's chip names the business it is talking about.
    const showing = (name: string) => expect(switcher).toHaveText(new RegExp(`${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
    const chip = panel(page).getByText("Business context", { exact: true }).locator("xpath=..");
    const choose = async (i: number) => {
      await switcher.click();
      await page.getByRole("menuitem").nth(i).click();
      await showing(names[i]);
      await expect(chip).toContainText(names[i]);
      await expect(panel(page).getByRole("textbox")).toBeVisible();
    };

    // Start from a business whose panel shows an earlier conversation (needs one: see e2e/README.md).
    let from = -1;
    let messages: string[] = [];
    for (let i = 0; i < names.length && from < 0; i++) {
      await choose(i);
      const items = panel(page).locator("ol > li");
      if ((await items.count()) > 0) {
        from = i;
        messages = (await items.allInnerTexts()).map((t) => t.trim()).filter(Boolean);
      }
    }
    expect(from, "a business with an earlier Espanda conversation").toBeGreaterThanOrEqual(0);

    const to = names.findIndex((n) => n !== names[from]);
    expect(to).toBeGreaterThanOrEqual(0);
    await choose(to);
    // Only the thread counts: the empty state's suggestions may repeat what was asked before.
    const after = (await panel(page).locator("ol > li").allInnerTexts()).map((t) => t.trim());
    for (const m of messages) expect(after).not.toContain(m);
  });

  test("a non-admin has no Admin entry and /admin does not render the console", async ({ page }) => {
    await page.goto("/connections");
    await openAccountMenu(page);
    await expect(page.getByRole("menuitem", { name: "Admin", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.goto("/admin");
    // Streamed responses can send 200 before the layout calls notFound(), so assert the page itself.
    await expect(page.getByRole("heading", { name: "This page doesn’t exist." })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Platform admin" })).toHaveCount(0);
  });
});

test.describe("owner connections", () => {
  test.use({ storageState: authFile("owner"), viewport: { width: 1440, height: 900 } });

  test("/connections offers Connect or Reconnect", async ({ page }) => {
    await page.goto("/connections");
    await expect(page.getByRole("main").getByRole("listitem").first()).toBeVisible();
    await expect(page.getByRole("button", { name: CONNECT_BUTTON }).first()).toBeVisible();
  });
});

test.describe("viewer", () => {
  test.use({ storageState: authFile("viewer"), viewport: { width: 1440, height: 900 } });

  test("/connections offers no Connect, Reconnect or Disconnect", async ({ page }) => {
    await page.goto("/connections");
    await expect(page.getByRole("heading", { name: "Connections", level: 1 })).toBeVisible();
    // Wait for the list itself, or an empty button count proves nothing.
    await expect(page.getByRole("main").getByRole("listitem").first()).toBeVisible();
    await expect(page.getByRole("button", { name: CONNECT_BUTTON })).toHaveCount(0);
  });
});

test.describe("platform admin", () => {
  test.use({ storageState: authFile("admin"), viewport: { width: 1440, height: 900 } });

  test("Admin is in the account menu and /admin renders", async ({ page }) => {
    await page.goto("/admin");
    await expect(page.getByRole("navigation", { name: "Platform admin" })).toBeVisible();
    await openAccountMenu(page);
    await expect(page.getByRole("menuitem", { name: "Admin", exact: true })).toBeVisible();
  });
});

test.describe("1100 px window", () => {
  test.use({ storageState: authFile("owner"), viewport: { width: 1100, height: 900 } });

  test("the assistant is a sheet opened from the top bar", async ({ page }) => {
    await page.goto("/connections");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(panel(page)).toBeHidden();
    await page.getByRole("button", { name: "Espanda", exact: true }).click();
    const sheet = page.getByRole("dialog");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("textbox")).toBeVisible();
  });
});
