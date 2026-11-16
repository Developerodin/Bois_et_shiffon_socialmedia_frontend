/**
 * UI audit against a running app (npm run build && npm run start): axe-core WCAG 2.0–2.2 A/AA +
 * best practices on every page at desktop, 375px and light theme, plus horizontal overflow,
 * tap targets under 24px and keyboard focus visibility. Run: npm run audit:ui -w web
 */
import { chromium, type Page } from "@playwright/test";
import path from "node:path";

// Optional: a locally installed Chromium if Playwright's bundled one isn't downloaded.
const EXE = process.env.PW_CHROMIUM_PATH || undefined;
const AXE = path.resolve(process.cwd(), "../../node_modules/axe-core/axe.min.js");
const BASE = "http://localhost:3100";
const PUBLIC = ["/login", "/forgot-password", "/reset-password?token=bad", "/invite/bad-token"];
const PRIVATE = ["/", "/welcome", "/settings", "/settings?tab=connections", "/performance", "/context", "/calendar"];

type Row = { page: string; vp: string; id: string; impact: string; help: string; n: number; sample: string };
const rows: Row[] = [];
const extras: string[] = [];

async function audit(page: Page, url: string, vp: string) {
  await page.goto(BASE + url);
  await page.waitForTimeout(2500);
  await page.addScriptTag({ path: AXE });
  const res = await page.evaluate(async () => {
    // @ts-expect-error injected
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa", "best-practice"] } });
    return r.violations.map((v: { id: string; impact: string; help: string; nodes: { target: string[] }[] }) => ({
      id: v.id, impact: v.impact, help: v.help, n: v.nodes.length, sample: v.nodes.slice(0, 2).map((n) => n.target.join(" ")).join(" | "),
    }));
  });
  for (const r of res) rows.push({ page: url, vp, ...r });

  const metrics = await page.evaluate(() => {
    const overflow = document.documentElement.scrollWidth - window.innerWidth;
    const interactive = [...document.querySelectorAll("a[href], button, [role=button], input, select, textarea, [role=tab], [role=menuitem]")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
    });
    const tiny = interactive.filter((el) => { const r = el.getBoundingClientRect(); return r.width < 24 || r.height < 24; })
      .map((el) => (el.getAttribute("aria-label") || (el as HTMLElement).innerText || el.tagName).trim().slice(0, 30));
    const under44 = interactive.filter((el) => { const r = el.getBoundingClientRect(); return r.height < 44; }).length;
    return { overflow, tiny: [...new Set(tiny)].slice(0, 8), tinyCount: tiny.length, under44, total: interactive.length };
  });
  // Keyboard: tab through the first 12 stops and check each shows a visible focus indicator.
  let noRing = 0;
  const noRingNames: string[] = [];
  await page.mouse.click(1, 1);
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    const f = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const s = getComputedStyle(el);
      const visible = (s.outlineStyle !== "none" && parseFloat(s.outlineWidth) > 0) || (s.boxShadow && s.boxShadow !== "none");
      return { visible, name: (el.getAttribute("aria-label") || el.innerText || el.tagName).trim().slice(0, 30) };
    });
    if (f && !f.visible) { noRing++; noRingNames.push(f.name); }
  }
  extras.push(`${vp.padEnd(7)} ${url.padEnd(26)} overflow:${metrics.overflow > 0 ? metrics.overflow + "px" : "none"} | targets<24px: ${metrics.tinyCount} ${metrics.tiny.length ? "(" + metrics.tiny.join(", ") + ")" : ""} | <44px tall: ${metrics.under44}/${metrics.total} | focus w/o visible ring: ${noRing}/12 ${noRingNames.length ? "(" + [...new Set(noRingNames)].slice(0, 4).join(", ") + ")" : ""}`);
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE });
  for (const [vp, size] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 375, height: 812 }]] as const) {
    const anon = await browser.newContext({ viewport: size, colorScheme: "dark" });
    const ap = await anon.newPage();
    for (const u of PUBLIC) await audit(ap, u, vp);
    const ctx = await browser.newContext({ viewport: size, colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto(BASE + "/login");
    await page.fill('input[name="email"]', process.env.SEED_ADMIN_EMAIL!);
    await page.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD!);
    await Promise.all([page.waitForURL((u) => !u.pathname.startsWith("/login")), page.press('input[name="password"]', "Enter")]);
    for (const u of PRIVATE) await audit(page, u, vp);
  }
  // Light theme spot check of the main screen.
  const light = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "light" });
  const lp = await light.newPage();
  await lp.goto(BASE + "/login");
  await lp.fill('input[name="email"]', process.env.SEED_ADMIN_EMAIL!);
  await lp.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD!);
  await Promise.all([lp.waitForURL((u) => !u.pathname.startsWith("/login")), lp.press('input[name="password"]', "Enter")]);
  await audit(lp, "/", "light");
  await audit(lp, "/settings", "light");
  await browser.close();

  const byRule = new Map<string, { impact: string; help: string; pages: Set<string>; n: number; sample: string }>();
  for (const r of rows) {
    const k = r.id;
    const e = byRule.get(k) ?? { impact: r.impact, help: r.help, pages: new Set(), n: 0, sample: r.sample };
    e.pages.add(`${r.vp}:${r.page}`);
    e.n += r.n;
    byRule.set(k, e);
  }
  const order = { critical: 0, serious: 1, moderate: 2, minor: 3 } as Record<string, number>;
  console.log("=== AXE VIOLATIONS (rule · impact · nodes · pages) ===");
  for (const [id, e] of [...byRule].sort((a, b) => order[a[1].impact] - order[b[1].impact])) {
    console.log(`${e.impact.toUpperCase().padEnd(9)} ${id} · ${e.n} nodes · ${e.help}\n          pages: ${[...e.pages].join(", ")}\n          e.g. ${e.sample.slice(0, 160)}`);
  }
  console.log("\n=== LAYOUT / TARGETS / KEYBOARD ===");
  console.log(extras.join("\n"));
})().catch((e) => { console.error(String(e).slice(0, 800)); process.exit(1); });
