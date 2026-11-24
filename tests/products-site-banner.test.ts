import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CatalogSync } from "@/shared";
import { ApiError } from "@/components/settings/api";
import { pollDelay, syncBanner, syncNowError } from "@/components/products/products-board";

const n = (v: number) => v.toLocaleString();
const site = (over: Partial<CatalogSync> = {}): CatalogSync => ({
  at: "2026-11-24T10:00:00Z", source: "SITE", count: 340, error: null, reason: "reading", pages: { read: 350, total: 5000, capped: false }, ...over,
});

describe("products sync banner", () => {
  it("shows the site reader's progress with counts", () => {
    expect(syncBanner(site())).toEqual({ text: `Reading your website's product pages: 350 of ${n(5000)} so far. More each day.`, tone: "info" });
  });

  it("adds the capped note, also once every page is read", () => {
    expect(syncBanner(site({ pages: { read: 350, total: 5000, capped: true } }))?.text).toContain(`lists more than ${n(5000)} product pages, so we read the newest ${n(5000)}.`);
    expect(syncBanner(site({ reason: null, pages: { read: 5000, total: 5000, capped: true } }))).toMatchObject({ tone: "info" });
    expect(syncBanner(site({ reason: null, pages: { read: 80, total: 80, capped: false } }))).toBeNull();
  });

  it("shows refusals and failures as warnings, and nothing for a clean feed sync", () => {
    const refused = site({ error: "Your website turned our product reader away", reason: "site-refused" });
    expect(syncBanner(refused)).toEqual({ text: refused.error, tone: "warning" });
    expect(syncBanner(site({ error: "We couldn't find product pages in your website's sitemap.", reason: "no-product-pages", pages: { read: 0, total: 0, capped: false } }))?.tone).toBe("warning");
    expect(syncBanner({ at: "2026-11-24T10:00:00Z", source: "SHOPIFY", count: 3, error: null, reason: null })).toBeNull();
    expect(syncBanner(null)).toBeNull();
  });

  it("words a paused reader as a warning and a feed that missed a day as news", () => {
    expect(syncBanner(site({ error: "We paused reading them.", reason: "pages-changed" }))).toEqual({ text: "We paused reading them.", tone: "warning" });
    expect(syncBanner(site({ source: "WEBSITE", error: "Your website's product feed didn't answer today.", reason: "feed-missing" }))?.tone).toBe("info");
  });

  it("polls fast, then slowly, and stops after an hour or at the UTC day's end", () => {
    const start = Date.parse("2026-11-24T10:00:00Z");
    expect(pollDelay(start, start + 10_000)).toBe(4000);
    expect(pollDelay(start, start + 200_000)).toBe(30_000);
    expect(pollDelay(start, start + 3_600_001)).toBeNull();
    const late = Date.parse("2026-11-24T23:50:00Z");
    expect(pollDelay(late, late + 5 * 60_000)).toBe(30_000);
    expect(pollDelay(late, late + 11 * 60_000)).toBeNull();
  });

  it("says Sync now's own limit plainly", () => {
    expect(syncNowError(new ApiError(429, "Too many syncs. Try again in a while."))).toMatch(/6 times an hour/);
    expect(syncNowError(new ApiError(500, "Boom"))).toBe("Boom");
  });

  it("follows a sync already running when the page opens", () => {
    const s = fs.readFileSync(path.join(process.cwd(), "components/products/products-board.tsx"), "utf8");
    expect(s).toContain("if (data?.running) setSyncing(true);");
    expect(s).toContain("if (status?.catalogSync) setLive(status.catalogSync);");
    expect(s).toContain('readingPages ? "Reading pages…" : "Syncing…"');
  });
});
