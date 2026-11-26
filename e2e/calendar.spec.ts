import { existsSync } from "node:fs";
import path from "node:path";
import { expect as baseExpect, test, type Page } from "@playwright/test";
import { authFile } from "./global-setup";

/**
 * The Content calendar page (/calendar) as the owner at four desktop sizes, a tablet and a phone, and once as a viewer.
 * Read-only against a shared database: it only navigates, switches views and filters (which live in the URL), opens
 * posts that already exist, and opens New post and cancels it. Any write to a post is refused in the browser and fails
 * the test. Checks that need a post or a busy day skip with a message when the business has none.
 * Run with `E2E_ROLES=owner,viewer` (the viewer test skips when that role has no saved session). Screenshots go to
 * e2e/screenshots/ (git-ignored), of the viewport, so the calendar's fill can be judged by eye.
 */
// The dev server compiles each route on its first visit; one wait for everything this spec looks for.
test.setTimeout(240_000);
const expect = baseExpect.configure({ timeout: 60_000 });

const SIZES = [
  { width: 1920, height: 1080 },
  { width: 1768, height: 888 },
  { width: 1657, height: 921 },
  { width: 1440, height: 900 },
  { width: 1280, height: 720 },
  { width: 820, height: 1180 },
  { width: 390, height: 844 },
] as const;
const SHOTS = path.join(__dirname, "screenshots");
/** The window width (px) from which the sidebar and the assistant are docked beside the page (`xl`). */
const DOCKED_FROM = 1280;
/** Under this calendar width (px) days show dots and an agenda (AGENDA_BELOW in lib/calendar-month.ts). */
const PHONE_BELOW = 640;
/** A wide day cell's floor (CELL_FLOOR) and the owner's target on a desktop window from 1440 px. */
const CELL_FLOOR = 72;
const DESKTOP_CELL_MIN = 85;
/** Months with four, five and six Monday-first weeks. */
const MONTHS = [
  { y: 2027, m: 1, weeks: 4, name: "February 2027" },
  { y: 2026, m: 11, weeks: 5, name: "December 2026" },
  { y: 2026, m: 10, weeks: 6, name: "November 2026" },
] as const;

/**
 * Fails the test on an uncaught page error, a console error, or any write to the posts API (which a read-only run must
 * never send: such a request is refused here).
 */
async function guard(page: Page) {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  const writes: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(m.text());
  });
  // Read-only against the shared database: every non-GET API call is stopped. Page-view beacons are dropped quietly;
  // anything else counts as a write and fails the test.
  await page.route(/\/api\/v1\//, (route) => {
    const req = route.request();
    if (req.method() === "GET" || req.method() === "HEAD") return route.continue();
    // Answered with an empty 204 rather than aborted: an aborted request logs a console error of its own.
    if (new URL(req.url()).pathname.startsWith("/api/v1/activity/page-views")) return route.fulfill({ status: 204 });
    writes.push(`${req.method()} ${req.url()}`);
    return route.abort();
  });
  return () => {
    expect(writes, "writes to posts").toEqual([]);
    expect(pageErrors, "uncaught page errors").toEqual([]);
    expect(consoleErrors, "console errors").toEqual([]);
  };
}

/** Opens a page and fails at once if the session is gone (the page went to /login). */
async function open(page: Page, url: string) {
  await page.goto(url);
  if (new URL(page.url()).pathname.startsWith("/login")) throw new Error(`Signed out: ${url} went to the sign-in page. Delete e2e/.auth/ to sign in afresh.`);
}

/** The calendar is on screen: its h1 (screen-reader only), the breadcrumb, and the List/Month switch. */
async function calendarShown(page: Page) {
  await expect(page).toHaveURL(/\/calendar(\?|$)/);
  await expect(page.getByRole("heading", { level: 1, name: "Content calendar" })).toBeAttached();
  await expect(page.getByRole("tablist", { name: "Calendar view" })).toBeVisible();
}

async function noSideways(page: Page) {
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), { timeout: 10_000 })
    .toBe(true);
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const main = document.getElementById("content");
          return !main || main.scrollWidth <= main.clientWidth;
        }),
      { timeout: 10_000 },
    )
    .toBe(true);
}

const tab = (page: Page, name: "List" | "Month") => page.getByRole("tablist", { name: "Calendar view" }).getByRole("tab", { name, exact: true });
const monthLabel = (page: Page) => page.getByRole("heading", { level: 2, name: /^[A-Z][a-z]+ \d{4}$/ });
/** The Status filter: a dropdown whose name is the label and the current choice ("Status: Any status"). */
const statusSelect = (page: Page) => page.getByRole("button", { name: /^Status: / });
const days = (page: Page) => page.locator("button[data-day]");
/** The week rows of the month grid (the second row group; the first holds the weekday names). */
const weekRows = (page: Page) => page.getByRole("table").getByRole("rowgroup").nth(1).getByRole("row");
/** A day's popover (under xl the assistant's drawer is a dialog too, off-screen). */
const dayPopover = (page: Page) => page.getByRole("dialog").filter({ has: page.getByRole("button", { name: "Close this day" }) });
/** The posts' peek: the page's region with a Close button. */
const peek = (page: Page) => page.locator("aside[role=region]");
const postCount = (label: string | null) => Number(/, (\d+) posts?/.exec(label ?? "")?.[1] ?? 0);

/** The Status filter: in the toolbar on a wide panel, else in the Filters popover (opened here). */
async function showStatusSelect(page: Page) {
  const select = statusSelect(page);
  if (await select.isVisible()) return select;
  await page.getByRole("button", { name: /^Filters/ }).click();
  await expect(select).toBeVisible();
  return select;
}

/** Opens the Status filter's menu and returns the values its options set (the "any" option is ""). */
async function statusValues(page: Page) {
  await (await showStatusSelect(page)).click();
  const menu = page.getByRole("menu", { name: "Status" });
  await expect(menu).toBeVisible();
  const values = await menu.getByRole("menuitemradio").evaluateAll((els) => els.map((e) => e.getAttribute("data-value") ?? ""));
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  return values;
}

/** Picks a Status option by its value from the dropdown's menu; the menu closes. */
async function pickStatus(page: Page, value: string) {
  await (await showStatusSelect(page)).click();
  const menu = page.getByRole("menu", { name: "Status" });
  await menu.locator(`[role=menuitemradio][data-value="${value}"]`).click();
  await expect(menu).toHaveCount(0);
}

/** Month view, its grid loaded. */
async function toMonth(page: Page) {
  await tab(page, "Month").click();
  await expect(tab(page, "Month")).toHaveAttribute("aria-selected", "true");
  await expect(monthLabel(page)).toBeVisible();
  await expect(days(page).first()).toBeVisible();
}

/** Steps the month with the arrows until the heading names year `y`, month `m` (0-based), and its grid has loaded. */
async function goToMonth(page: Page, y: number, m: number) {
  const [name, year] = (await monthLabel(page).innerText()).trim().split(" ");
  const shown = new Date(`${name} 1, ${year}`);
  const steps = (y - shown.getFullYear()) * 12 + (m - shown.getMonth());
  const button = page.getByRole("button", { name: steps > 0 ? "Next month" : "Previous month" });
  for (let i = 0; i < Math.abs(steps); i++) await button.click();
  await expect(monthLabel(page)).toHaveText(new Date(y, m, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" }));
  await expect(days(page).first()).toBeVisible();
  // The month's posts come from their own read: wait for the skeleton to go.
  await expect(page.getByText("Loading this month")).toHaveCount(0);
}

/**
 * Every day's posts are reachable: in a wide month each day shows cards for some and "+N more" for the rest, which
 * together make the count its name reads. Returns the day with a "+N more", if any.
 */
async function everyPostReachable(page: Page) {
  return page.evaluate(() => {
    const bad: string[] = [];
    let more: string | null = null;
    for (const day of document.querySelectorAll<HTMLButtonElement>("button[data-day]")) {
      const n = Number(/, (\d+) posts?/.exec(day.getAttribute("aria-label") ?? "")?.[1] ?? 0);
      const cell = day.parentElement!;
      const cards = [...cell.querySelectorAll<HTMLButtonElement>("button:not([data-day])")];
      const moreButton = cards.find((b) => /^\+\d+ more$/.test(b.innerText.trim()));
      const shown = cards.length - (moreButton ? 1 : 0);
      const hidden = moreButton ? Number(/\d+/.exec(moreButton.innerText)![0]) : 0;
      if (shown + hidden !== n) bad.push(`${day.dataset.day}: ${n} posts, ${shown} cards + ${hidden} more`);
      // Nothing escapes its cell: each card's box is inside the cell's.
      const c = cell.getBoundingClientRect();
      for (const b of cards) {
        const r = b.getBoundingClientRect();
        if (r.bottom > c.bottom + 0.5 || r.right > c.right + 0.5) bad.push(`${day.dataset.day}: a card runs out of its cell`);
      }
      if (moreButton && !more) more = day.dataset.day!;
    }
    return { bad, more };
  });
}

/**
 * The first day of the grid with no posts that still has a whole hour left (from tomorrow; today after 22:00 has
 * none), or null: New post from it is set to that day.
 */
async function futureEmptyDay(page: Page) {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const from = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  const keys = await page.locator('button[data-day][aria-label$=", 0 posts"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-day")!));
  return keys.find((k) => k >= from) ?? null;
}

/** The page's layout numbers: a day cell's size, the space under the calendar's card, and the assistant column. */
async function layout(page: Page) {
  return page.evaluate(() => {
    const main = document.getElementById("content")!;
    const card = document.querySelector("[role=table]")!.closest<HTMLElement>(".rounded-2xl")!;
    const cell = document.querySelector<HTMLElement>("[role=cell]")!;
    const m = main.getBoundingClientRect();
    const c = card.getBoundingClientRect();
    const assistant = document.querySelector<HTMLElement>('aside[aria-label="Bois & Chiffons"]')?.getBoundingClientRect();
    return {
      cellHeight: cell.offsetHeight,
      cellWidth: cell.offsetWidth,
      // Space between the card's bottom and the end of the main area's scrolled content (its 24 px padding included).
      below: Math.round(main.scrollHeight - (c.bottom - m.top + main.scrollTop)),
      // How far the main area scrolls (0: the page fits the window).
      overflow: main.scrollHeight - main.clientHeight,
      cardRight: Math.round(c.right),
      assistant: assistant && assistant.width > 0 && assistant.left < window.innerWidth ? { left: Math.round(assistant.left), right: Math.round(assistant.right) } : null,
      viewport: window.innerWidth,
    };
  });
}

test.describe("owner", () => {
  test.use({ storageState: authFile("owner") });

  for (const size of SIZES) {
    const tag = `${size.width}x${size.height}`;
    const phone = size.width < PHONE_BELOW;
    test.describe(`at ${tag}`, () => {
      test.use({ viewport: size });

      test("Month fills the page for 4-, 5- and 6-week months, every post reachable, beside the assistant", async ({ page }) => {
        const done = await guard(page);
        await open(page, "/calendar");
        await calendarShown(page);
        await toMonth(page);
        for (const month of MONTHS) {
          await goToMonth(page, month.y, month.m);
          await expect(weekRows(page)).toHaveCount(month.weeks);
          await expect(days(page)).toHaveCount(month.weeks * 7);
          await noSideways(page);
          const l = await layout(page);
          console.log(`${tag} ${month.name}: cell ${l.cellWidth}x${l.cellHeight}, ${l.below}px under the card, scrolls ${l.overflow}px`);
          // No large empty area under the calendar: the card ends at the main area's bottom padding.
          expect(l.below, "space under the calendar").toBeLessThanOrEqual(32);
          if (!phone) {
            expect(l.cellHeight, "day cell height").toBeGreaterThanOrEqual(CELL_FLOOR);
            if (size.width >= 1440 && size.height >= 900) expect(l.cellHeight, "day cell height on a desktop").toBeGreaterThanOrEqual(DESKTOP_CELL_MIN);
            const reach = await everyPostReachable(page);
            expect(reach.bad, "posts each day shows").toEqual([]);
            // Readable cards: each title gets most of its cell's width, not the few letters a time beside it left.
            if (size.width >= 1440) {
              const narrowest = await page.evaluate(() => {
                const titles = [...document.querySelectorAll<HTMLElement>("[role=cell] [data-card-title]")];
                // A title shown whole is fine at any width; one cut short has most of its cell (a time beside it left about a third).
                const cut = titles.filter((t) => t.scrollWidth > t.clientWidth);
                return cut.length ? Math.min(...cut.map((t) => t.getBoundingClientRect().width / t.closest("[role=cell]")!.getBoundingClientRect().width)) : null;
              });
              if (narrowest !== null) expect(narrowest, "a card title's share of its cell's width").toBeGreaterThanOrEqual(0.6);
            }
          }
          // A desktop window the month fits in doesn't scroll at all.
          if (size.width >= DOCKED_FROM) expect(l.overflow, "main area scroll").toBeLessThanOrEqual(0);
          // The docked assistant sits beside the calendar, both inside the window.
          if (size.width >= DOCKED_FROM) {
            expect(l.assistant, "docked assistant").not.toBeNull();
            expect(l.assistant!.left).toBeGreaterThanOrEqual(l.cardRight);
            expect(l.assistant!.right).toBeLessThanOrEqual(l.viewport);
          }
          if (month.weeks !== 6) await page.screenshot({ path: path.join(SHOTS, `calendar-${tag}-${month.weeks}wk.png`) });
        }
        // November 2026, six weeks, is the page's main screenshot.
        await page.screenshot({ path: path.join(SHOTS, `calendar-${tag}.png`) });
        done();
      });

      test("the month arrows and Today change the month; List and Month switch", async ({ page }) => {
        const done = await guard(page);
        await open(page, "/calendar");
        await calendarShown(page);
        await toMonth(page);
        const now = (await monthLabel(page).innerText()).trim();
        await page.getByRole("button", { name: "Next month" }).click();
        await expect(monthLabel(page)).not.toHaveText(now);
        const next = (await monthLabel(page).innerText()).trim();
        await page.getByRole("button", { name: "Previous month" }).click();
        await page.getByRole("button", { name: "Previous month" }).click();
        await expect(monthLabel(page)).not.toHaveText(now);
        await expect(monthLabel(page)).not.toHaveText(next);
        await page.getByRole("button", { name: "Today", exact: true }).click();
        await expect(monthLabel(page)).toHaveText(now);
        await expect(days(page).and(page.locator("[aria-current=date]"))).toHaveCount(1);

        await tab(page, "List").click();
        await expect(tab(page, "List")).toHaveAttribute("aria-selected", "true");
        await expect(monthLabel(page)).toHaveCount(0);
        await noSideways(page);
        await page.screenshot({ path: path.join(SHOTS, `calendar-${tag}-list.png`) });
        await toMonth(page);
        done();
      });

      test("each status filter goes into the URL, narrows the month and clears", async ({ page }) => {
        const done = await guard(page);
        await open(page, "/calendar");
        await calendarShown(page);
        await toMonth(page);
        const total = async () => (await days(page).evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")))).reduce((n, l) => n + postCount(l), 0);
        const all = await total();
        const options = (await statusValues(page)).filter(Boolean);
        expect(options.length).toBeGreaterThan(0);
        let sum = 0;
        for (const value of options) {
          await pickStatus(page, value);
          await expect(page).toHaveURL(new RegExp(`[?&]cf_status=${value}(&|$)`));
          const n = await total();
          expect(n).toBeLessThanOrEqual(all);
          sum += n;
          await noSideways(page);
        }
        // The status groups don't overlap, so their posts add up to no more than the unfiltered month.
        expect(sum).toBeLessThanOrEqual(all);
        await page.reload();
        await calendarShown(page);
        await expect(page).toHaveURL(new RegExp(`[?&]cf_status=${options[options.length - 1]}(&|$)`));
        // Narrower panels fold the selects into the Filters button, which counts what is on.
        if (!(await statusSelect(page).isVisible())) await expect(page.getByRole("button", { name: /^Filters/ })).toContainText("1");
        // The chosen filter's pill is marked as on; "Any status" clears it.
        await expect(await showStatusSelect(page)).not.toHaveAccessibleName("Status: Any status");
        await pickStatus(page, "");
        await expect(page).not.toHaveURL(/cf_status=/);
        done();
      });

      if (!phone) {
        test('"+N more" and a day open a popover listing every post; an empty day offers New post', async ({ page }) => {
          const done = await guard(page);
          await open(page, "/calendar");
          await calendarShown(page);
          await toMonth(page);
          await goToMonth(page, 2026, 10);
          // A day with posts: "+N more" if any day has one, else the busiest day.
          const reach = await everyPostReachable(page);
          const busiest = await days(page).evaluateAll((els) => els.map((e) => [e.getAttribute("data-day"), Number(/, (\d+) posts?/.exec(e.getAttribute("aria-label") ?? "")?.[1] ?? 0)] as const).sort((a, b) => b[1] - a[1])[0]);
          test.skip(!reach.more && busiest[1] === 0, "No posts in November 2026: no day to open.");
          const key = reach.more ?? busiest[0]!;
          const day = page.locator(`button[data-day="${key}"]`);
          const n = postCount(await day.getAttribute("aria-label"));
          if (reach.more) await day.locator("..").getByRole("button", { name: /^\+\d+ more$/ }).click();
          // The cards cover the cell's middle: a click on the day itself lands in its date row, right of the number.
          else await day.click({ position: { x: 60, y: 8 } });
          const dialog = dayPopover(page);
          await expect(dialog).toBeVisible();
          await expect(day).toHaveAttribute("aria-expanded", "true");
          await expect(dialog.getByRole("listitem")).toHaveCount(n);
          // Not clipped: the popover is inside the window.
          const box = (await dialog.boundingBox())!;
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(box.y + box.height).toBeLessThanOrEqual(size.height);
          await noSideways(page);
          await page.waitForTimeout(300); // the 150 ms fade and scale in
          await page.screenshot({ path: path.join(SHOTS, `calendar-${tag}-popover.png`) });
          await dialog.getByRole("button", { name: "Close this day" }).click();
          await expect(dialog).toHaveCount(0);

          // An empty day from today on: its popover offers New post, which opens the New post dialog set to that day;
          // cancelled, nothing is sent.
          const emptyKey = await futureEmptyDay(page);
          test.skip(!emptyKey, "No empty day from today on in November 2026.");
          await page.locator(`button[data-day="${emptyKey}"]`).click();
          const pop = dayPopover(page);
          await expect(pop).toContainText("Nothing on");
          await pop.getByRole("button", { name: "New post" }).click();
          const create = page.getByRole("dialog", { name: "New product post" });
          await expect(create).toBeVisible();
          await expect(create.getByLabel("Date and time")).toHaveValue(new RegExp(`^${emptyKey}T[0-9]{2}:00$`));
          await page.screenshot({ path: path.join(SHOTS, `calendar-${tag}-new-post.png`) });
          await create.getByRole("button", { name: "Cancel" }).click();
          await expect(create).toHaveCount(0);
          done();
        });
      } else {
        test("tapping a day lists its posts under the grid; an empty day offers New post", async ({ page }) => {
          const done = await guard(page);
          await open(page, "/calendar");
          await calendarShown(page);
          await toMonth(page);
          await goToMonth(page, 2026, 10);
          const busy = page.locator('button[data-day]:not([aria-label$=", 0 posts"])');
          test.skip((await busy.count()) === 0, "No posts in November 2026: nothing to tap.");
          const day = busy.first();
          const n = postCount(await day.getAttribute("aria-label"));
          await day.click();
          await expect(day).toHaveAttribute("aria-pressed", "true");
          const agenda = page.getByRole("region", { name: "Posts on the chosen day" });
          await expect(agenda.getByRole("heading", { level: 3 })).toContainText(n === 1 ? "1 post" : `${n} posts`);
          await expect(agenda.getByRole("listitem")).toHaveCount(n);
          await noSideways(page);
          await page.screenshot({ path: path.join(SHOTS, `calendar-${tag}-agenda.png`) });
          const emptyKey = await futureEmptyDay(page);
          test.skip(!emptyKey, "No empty day from today on in November 2026.");
          await page.locator(`button[data-day="${emptyKey}"]`).click();
          await agenda.getByRole("button", { name: "New post" }).click();
          const create = page.getByRole("dialog", { name: "New product post" });
          await expect(create).toBeVisible();
          await expect(create.getByLabel("Date and time")).toHaveValue(new RegExp(`^${emptyKey}T[0-9]{2}:00$`));
          await create.getByRole("button", { name: "Cancel" }).click();
          await expect(create).toHaveCount(0);
          done();
        });
      }

      test("a post opens in the peek beside the calendar and closes back to it", async ({ page }) => {
        const done = await guard(page);
        await open(page, "/calendar");
        await calendarShown(page);
        await toMonth(page);
        await goToMonth(page, 2026, 10);
        const cards = page.locator("[role=cell] button:not([data-day])").filter({ hasNotText: /^\+\d+ more$/ });
        if (phone) {
          const busy = page.locator('button[data-day]:not([aria-label$=", 0 posts"])');
          test.skip((await busy.count()) === 0, "No posts in November 2026: nothing to open.");
          await busy.first().click();
          await page.getByRole("region", { name: "Posts on the chosen day" }).getByRole("listitem").first().getByRole("button").click();
        } else {
          test.skip((await cards.count()) === 0, "No posts in November 2026: nothing to open.");
          await cards.first().click();
        }
        await expect(page).toHaveURL(/[?&]post=[^&]+/);
        await expect(peek(page)).toBeVisible();
        await expect(peek(page).locator("[data-peek-title]")).not.toBeEmpty();
        // Wait for the slide-in, then check the calendar's toolbar and Sunday are beside the peek, not under it.
        await expect.poll(async () => (await peek(page).boundingBox())!.x + (await peek(page).boundingBox())!.width).toBeLessThanOrEqual(size.width + 1);
        await page.waitForTimeout(400);
        await noSideways(page);
        if (size.width >= 1440) {
          const peekLeft = (await peek(page).boundingBox())!.x;
          const last = page.getByRole("button", { name: "New post" }).first();
          const sunday = page.getByRole("columnheader").last();
          for (const [what, el] of [["New post", last], ["Sunday", sunday]] as const) {
            const b = (await el.boundingBox())!;
            expect(b.x, `${what} left edge`).toBeGreaterThanOrEqual(0);
            expect(b.x + b.width, `${what} beside the peek`).toBeLessThanOrEqual(peekLeft);
          }
          const lastCell = (await page.locator("[role=cell]").last().boundingBox())!;
          expect(lastCell.x + lastCell.width, "Sunday's cells beside the peek").toBeLessThanOrEqual(peekLeft);
        }
        await page.screenshot({ path: path.join(SHOTS, `calendar-${tag}-peek.png`) });
        await peek(page).getByRole("button", { name: "Close", exact: true }).click();
        await expect(page).not.toHaveURL(/[?&]post=/);
        await expect(peek(page)).toHaveCount(0);
        done();
      });

      test("the month's surfaces, cards and toolbar: white days, today, the chosen day and the open post apart", async ({ page }) => {
        const done = await guard(page);
        await open(page, "/calendar");
        await calendarShown(page);
        await toMonth(page);
        await goToMonth(page, 2026, 10);
        await expect(weekRows(page)).toHaveCount(6);
        // The month's own days are white; the next or last month's are not.
        const fills = await page.evaluate(() => {
          // The chosen day (the phone's agenda always has one) has a fill of its own: left out.
          const cells = [...document.querySelectorAll<HTMLElement>("[role=cell]")].filter((c) => !c.querySelector('button[data-day][aria-pressed="true"], button[data-day][aria-expanded="true"]'));
          const fill = (c: HTMLElement) => getComputedStyle(c).backgroundColor;
          const inMonth = cells.filter((c) => c.querySelector<HTMLElement>("button[data-day]")!.dataset.day!.startsWith("2026-11"));
          const outside = cells.filter((c) => !c.querySelector<HTMLElement>("button[data-day]")!.dataset.day!.startsWith("2026-11"));
          return { inMonth: [...new Set(inMonth.map(fill))], outside: [...new Set(outside.map(fill))] };
        });
        expect(fills.inMonth, "the month's days").toEqual(["rgb(255, 255, 255)"]);
        expect(fills.outside.every((f) => f !== "rgb(255, 255, 255)"), "other months' days").toBe(true);
        if (!phone) {
          // Every control in the toolbar's rows is one height.
          const heights = await page.evaluate(() => {
            const bar = document.querySelector('[role="tablist"][aria-label="Calendar view"]')!.closest(".border-b")!;
            return [...bar.querySelectorAll<HTMLElement>('[role="tablist"], button:not([role="tab"]), select')].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height));
          });
          expect(new Set(heights), "toolbar control heights").toEqual(new Set([32]));
          const reach = await everyPostReachable(page);
          expect(reach.bad, "posts each day shows").toEqual([]);
        }
        await noSideways(page);
        await page.screenshot({ path: path.join(SHOTS, `polish-${tag}.png`) });

        // The chosen day (popover or agenda) is outlined, unlike today, which only has its dark date.
        const busy = page.locator('button[data-day]:not([aria-label$=", 0 posts"])');
        test.skip((await busy.count()) === 0, "No posts in November 2026: no day to choose or post to open.");
        const reach = phone ? { more: null } : await everyPostReachable(page);
        const key = reach.more ?? (await busy.first().getAttribute("data-day"))!;
        const day = page.locator(`button[data-day="${key}"]`);
        if (phone) await day.click();
        else if (reach.more) await day.locator("..").getByRole("button", { name: /^\+\d+ more$/ }).click();
        else await day.click({ position: { x: 60, y: 8 } });
        if (!phone) {
          const dialog = dayPopover(page);
          await expect(dialog.getByRole("listitem")).toHaveCount(postCount(await day.getAttribute("aria-label")));
          const box = (await dialog.boundingBox())!;
          expect(box.y + box.height, "popover inside the window").toBeLessThanOrEqual(size.height);
          await page.waitForTimeout(300);
          await page.screenshot({ path: path.join(SHOTS, `polish-${tag}-popover.png`) });
          // A post from the popover opens in the peek; its card (or "+N more") is marked as the open post.
          await dialog.getByRole("listitem").first().getByRole("button").click();
        } else {
          await page.getByRole("region", { name: "Posts on the chosen day" }).getByRole("listitem").first().getByRole("button").click();
        }
        await expect(page).toHaveURL(/[?&]post=[^&]+/);
        await expect(peek(page)).toBeVisible();
        if (!phone) await expect(page.locator('[role=cell] button[aria-current="true"]')).toHaveCount(1);
        await page.waitForTimeout(400);
        await noSideways(page);
        await page.screenshot({ path: path.join(SHOTS, `polish-${tag}-open-post.png`) });
        done();
      });

      test("old Overview links redirect to /calendar; a crafted filter is ignored", async ({ page }) => {
        const done = await guard(page);
        await open(page, "/?panel=content");
        await calendarShown(page);
        expect(new URL(page.url()).search).toBe("");
        await open(page, "/?peek=content&cf_status=published");
        await calendarShown(page);
        expect(new URL(page.url()).searchParams.get("cf_status")).toBe("published");
        await open(page, "/calendar?cf_status=toString");
        await calendarShown(page);
        if (!(await statusSelect(page).isVisible())) await expect(page.getByRole("button", { name: /^Filters/ })).not.toContainText(/\d/);
        else await expect(statusSelect(page)).toHaveAccessibleName("Status: Any status");
        done();
      });
    });
  }
});

test.describe("viewer", () => {
  // The viewer's saved session is made by global setup when E2E_ROLES includes viewer and its sign-in works.
  test.skip(!existsSync(authFile("viewer")), "No viewer session (E2E_ROLES without viewer, or the viewer account can't sign in).");
  test.use({ storageState: authFile("viewer"), viewport: { width: 1657, height: 921 } });

  test("sees the calendar, without New post or Export", async ({ page }) => {
    const done = await guard(page);
    await open(page, "/calendar");
    // A viewer holds brand.read (the posts list) but not content.create or content.download.
    await calendarShown(page);
    await toMonth(page);
    await expect(page.getByRole("button", { name: "New post" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Export/ })).toHaveCount(0);
    await noSideways(page);
    await page.screenshot({ path: path.join(SHOTS, "calendar-viewer-1657x921.png") });
    done();
  });
});
