import { describe, expect, it } from "vitest";
import { extractPage, robotsGroups } from "@/server/research/crawl";
import { aiCrawlerAccess, geoTechnicalChecks, scoreFindings, seoChecks } from "@/server/seo/checks";

const page = (url: string, html: string) => {
  const p = extractPage(html, new URL(url));
  return { url, title: p.title, description: p.description, text: p.text, seo: p.seo };
};

const GOOD = `<html lang="fr"><head><title>Table en chêne massif | Bois & Chiffons</title>
<meta name="description" content="Table en chêne massif fabriquée en France, livrée chez vous.">
<meta name="viewport" content="width=device-width"><link rel="canonical" href="https://shop.test/table">
<meta property="og:image" content="https://shop.test/t.jpg">
<script type="application/ld+json">{"@context":"https://schema.org","@type":["Organization","Store"]}</script>
<script type="application/ld+json">{"@type":"Product","name":"Table"}</script></head>
<body><h1>Table</h1><img src="a.jpg" alt="Table en chêne">${"mot ".repeat(300)}</body></html>`;

describe("robots groups", () => {
  it("shares rules across consecutive user-agents and falls back to *", () => {
    const g = robotsGroups("User-agent: GPTBot\nUser-agent: CCBot\nDisallow: /\n\nUser-agent: *\nDisallow: /cart\n");
    expect(g.get("gptbot")).toEqual(["/"]);
    expect(g.get("ccbot")).toEqual(["/"]);
    const access = aiCrawlerAccess("User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow: /cart\n");
    expect(access.find((a) => a.ua === "GPTBot")!.allowed).toBe(false);
    expect(access.find((a) => a.ua === "OAI-SearchBot")!.allowed).toBe(true);
  });
});

describe("SEO checks", () => {
  it("a well-built page has no findings and scores 100", () => {
    const f = seoChecks({ startUrl: "https://shop.test/", pages: [page("https://shop.test/", GOOD)], robotsTxt: "User-agent: *\nDisallow: /cart", hasSitemap: true, hasLlmsTxt: true });
    expect(f).toEqual([]);
    expect(scoreFindings(f)).toBe(100);
  });

  it("flags blocked crawling, missing basics and lowers the score", () => {
    const f = seoChecks({ startUrl: "http://shop.test/", pages: [page("http://shop.test/", "<html><body><img src=x></body></html>")], robotsTxt: "User-agent: *\nDisallow: /", hasSitemap: false, hasLlmsTxt: false });
    const ids = f.map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(["https", "robots-blocks-all", "sitemap-missing", "title-missing", "description-missing", "h1-missing", "viewport-missing", "img-alt", "schema-product"]));
    expect(scoreFindings(f)).toBe(0);
  });

  it("GEO flags blocked AI search bots and JS-only homepages", () => {
    const f = geoTechnicalChecks({ startUrl: "https://shop.test/", pages: [page("https://shop.test/", "<html><body><div id=root></div></body></html>")], robotsTxt: "User-agent: PerplexityBot\nDisallow: /", hasSitemap: true, hasLlmsTxt: false });
    expect(f.map((x) => x.id)).toEqual(expect.arrayContaining(["ai-search-blocked", "llms-missing", "js-rendered", "entity-schema"]));
  });
});
