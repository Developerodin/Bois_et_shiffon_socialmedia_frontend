import type { CrawledPage } from "@/server/research/crawl";
import { robotsGroups } from "@/server/research/crawl";

/**
 * Deterministic SEO/GEO checks (no AI): same site in → same findings and score out.
 * Criteria adapted from claude-seo (seo-technical, seo-content, seo-schema, seo-geo; MIT, see NOTICE.md).
 * The AI step only prioritises and explains these; it never invents findings.
 */
export type Severity = "critical" | "high" | "medium" | "low";
export type Finding = {
  id: string;
  category: string;
  severity: Severity;
  title: string;
  detail: string;
  urls?: string[];
  fix: string;
  /** Set by the AI step: why this matters for this brand. */
  why?: string;
};

/** Order findings as the AI prioritised them (unknown ids ignored, unlisted ones kept at the end). */
export function applyPriorities(findings: Finding[], priorities: { findingId: string; why: string }[]) {
  const byId = new Map(findings.map((f) => [f.id, f]));
  const ordered = priorities.flatMap((p) => {
    const f = byId.get(p.findingId);
    if (!f) return [];
    byId.delete(p.findingId);
    return [{ ...f, why: p.why }];
  });
  return [...ordered, ...byId.values()];
}

const WEIGHT: Record<Severity, number> = { critical: 25, high: 10, medium: 5, low: 2 };

/** 100 minus severity-weighted penalties, floored at 0. */
export const scoreFindings = (findings: Finding[]) =>
  Math.max(0, 100 - findings.reduce((sum, f) => sum + WEIGHT[f.severity], 0));

export type SiteFacts = {
  startUrl: string;
  pages: CrawledPage[];
  robotsTxt: string | null;
  hasSitemap: boolean;
  hasLlmsTxt: boolean;
};

const pagesWhere = (pages: CrawledPage[], pred: (p: CrawledPage) => boolean) =>
  pages.filter(pred).map((p) => p.url);

export function seoChecks({ startUrl, pages, robotsTxt, hasSitemap }: SiteFacts): Finding[] {
  const out: Finding[] = [];
  const add = (f: Finding) => out.push(f);
  const seo = (p: CrawledPage) => p.seo!;
  const withSeo = pages.filter((p) => p.seo);

  if (!startUrl.startsWith("https://")) {
    add({ id: "https", category: "Security", severity: "critical", title: "Site is not served over HTTPS", detail: "Browsers mark it as not secure and Google uses HTTPS as a ranking signal.", fix: "Install a TLS certificate and redirect all http:// traffic to https://." });
  }
  if (robotsTxt === null) {
    add({ id: "robots-missing", category: "Crawlability", severity: "low", title: "No robots.txt", detail: "Crawlers fall back to defaults; you can't point them to your sitemap.", fix: "Add /robots.txt with a Sitemap: line." });
  } else if ((robotsGroups(robotsTxt).get("*") ?? []).includes("/")) {
    add({ id: "robots-blocks-all", category: "Crawlability", severity: "critical", title: "robots.txt blocks all crawlers", detail: "`User-agent: *` has `Disallow: /`, so search engines are told not to crawl the site.", fix: "Remove `Disallow: /` for `User-agent: *` (keep blocks only for private paths like /cart)." });
  }
  if (!hasSitemap) {
    add({ id: "sitemap-missing", category: "Crawlability", severity: "medium", title: "No XML sitemap found", detail: "Neither /sitemap.xml nor a Sitemap: line in robots.txt was found.", fix: "Publish /sitemap.xml listing every indexable page and reference it in robots.txt." });
  }

  const noindex = pagesWhere(withSeo, (p) => /noindex/i.test(seo(p).robots ?? ""));
  if (noindex.length) add({ id: "noindex", category: "Indexability", severity: "high", title: "Pages marked noindex", detail: "These pages ask search engines not to index them. Check this is intentional.", urls: noindex, fix: "Remove `noindex` from pages that should appear in search." });

  const noTitle = pagesWhere(pages, (p) => !p.title);
  if (noTitle.length) add({ id: "title-missing", category: "On-page", severity: "high", title: "Pages without a title", detail: "The title is the clickable headline in search results.", urls: noTitle, fix: "Give each page a unique, descriptive <title> (about 50–60 characters)." });
  const badTitle = pagesWhere(pages, (p) => !!p.title && (p.title.length > 60 || p.title.length < 15));
  if (badTitle.length) add({ id: "title-length", category: "On-page", severity: "low", title: "Titles too long or too short", detail: "Titles over ~60 characters get cut off; very short ones waste the space.", urls: badTitle, fix: "Aim for 15–60 characters, main keyword first, brand last." });

  const titles = new Map<string, string[]>();
  for (const p of pages) if (p.title) titles.set(p.title, [...(titles.get(p.title) ?? []), p.url]);
  const dupTitles = [...titles.values()].filter((u) => u.length > 1).flat();
  if (dupTitles.length) add({ id: "title-duplicate", category: "On-page", severity: "medium", title: "Duplicate page titles", detail: "Several pages share the same title, so search engines can't tell them apart.", urls: dupTitles, fix: "Make every title unique to its page's content." });

  const noDesc = pagesWhere(pages, (p) => !p.description);
  if (noDesc.length) add({ id: "description-missing", category: "On-page", severity: "medium", title: "Pages without a meta description", detail: "Search engines then pick a snippet themselves, often a poor one.", urls: noDesc, fix: "Write a 120–155 character description per page with a clear benefit and call to action." });

  const noH1 = pagesWhere(withSeo, (p) => seo(p).h1Count === 0);
  if (noH1.length) add({ id: "h1-missing", category: "On-page", severity: "medium", title: "Pages without an H1 heading", detail: "The H1 tells search engines and AI what the page is about.", urls: noH1, fix: "Add exactly one H1 per page describing its main topic." });
  const multiH1 = pagesWhere(withSeo, (p) => seo(p).h1Count > 1);
  if (multiH1.length) add({ id: "h1-multiple", category: "On-page", severity: "low", title: "Pages with several H1 headings", detail: "Multiple H1s blur the page's main topic.", urls: multiH1, fix: "Keep one H1; turn the others into H2s." });

  const noCanonical = pagesWhere(withSeo, (p) => !seo(p).canonical);
  if (noCanonical.length) add({ id: "canonical-missing", category: "Indexability", severity: "low", title: "Pages without a canonical tag", detail: "Without it, URL variants (filters, tracking parameters) can be indexed as duplicates.", urls: noCanonical, fix: "Add a self-referencing <link rel=\"canonical\"> in the server-rendered HTML." });

  const noLang = pagesWhere(withSeo, (p) => !seo(p).lang);
  if (noLang.length) add({ id: "lang-missing", category: "International", severity: "medium", title: "Language not declared", detail: "`<html lang>` is missing, so search engines must guess the page language.", urls: noLang, fix: "Set <html lang=\"fr\"> (or the page's language) on every page." });
  const hreflangNoDefault = pagesWhere(withSeo, (p) => seo(p).hreflang.length > 0 && !seo(p).hreflang.includes("x-default"));
  if (hreflangNoDefault.length) add({ id: "hreflang-xdefault", category: "International", severity: "low", title: "hreflang without x-default", detail: "Language alternates are declared but there's no fallback for other visitors.", urls: hreflangNoDefault, fix: "Add <link rel=\"alternate\" hreflang=\"x-default\"> pointing to the default version." });

  const noViewport = pagesWhere(withSeo, (p) => !seo(p).viewport);
  if (noViewport.length) add({ id: "viewport-missing", category: "Mobile", severity: "high", title: "Not set up for mobile", detail: "No viewport meta tag. Google indexes the mobile version of every site.", urls: noViewport, fix: "Add <meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">." });

  const missingAlt = withSeo.reduce((n, p) => n + seo(p).imagesMissingAlt, 0);
  if (missingAlt > 0) add({ id: "img-alt", category: "Images", severity: missingAlt > 10 ? "medium" : "low", title: `${missingAlt} image(s) without alt text`, detail: "Alt text helps image search, accessibility and AI understanding of product photos.", urls: pagesWhere(withSeo, (p) => seo(p).imagesMissingAlt > 0), fix: "Describe each product image, e.g. \"Solid oak dining table, 6 seats, natural finish\"." });

  const thin = pagesWhere(withSeo.slice(1), (p) => seo(p).wordCount < 250);
  if (thin.length) add({ id: "thin-content", category: "Content", severity: "low", title: "Thin pages", detail: "These pages have under ~250 words of server-rendered text.", urls: thin, fix: "Add useful copy: materials, dimensions, care, delivery, FAQs." });

  const types = new Set(withSeo.flatMap((p) => seo(p).jsonLdTypes));
  if (!types.has("Organization") && !types.has("LocalBusiness") && !types.has("Store")) {
    add({ id: "schema-org", category: "Structured data", severity: "medium", title: "No Organization structured data", detail: "Search engines and AI assistants use it to recognise the brand as an entity.", fix: "Add Organization JSON-LD (name, logo, url, sameAs links to social profiles)." });
  }
  if (!types.has("Product")) {
    add({ id: "schema-product", category: "Structured data", severity: "medium", title: "No Product structured data on the pages read", detail: "Product markup enables price and availability in search results.", fix: "Add Product JSON-LD with name, image, offers (price, currency, availability) on product pages." });
  }

  const noOg = pagesWhere(withSeo, (p) => !seo(p).ogImage);
  if (noOg.length) add({ id: "og-image", category: "Social", severity: "low", title: "No social preview image", detail: "Links shared on Facebook, Pinterest or WhatsApp show no image.", urls: noOg, fix: "Add <meta property=\"og:image\"> with a 1200×630 image per page." });

  return out;
}

/** AI crawlers that power AI *search/answers* vs ones that only collect training data. */
export const AI_CRAWLERS = [
  { ua: "OAI-SearchBot", owner: "OpenAI", purpose: "search" },
  { ua: "ChatGPT-User", owner: "OpenAI", purpose: "search" },
  { ua: "PerplexityBot", owner: "Perplexity", purpose: "search" },
  { ua: "ClaudeBot", owner: "Anthropic", purpose: "search" },
  { ua: "GPTBot", owner: "OpenAI", purpose: "training" },
  { ua: "Google-Extended", owner: "Google", purpose: "training" },
  { ua: "CCBot", owner: "Common Crawl", purpose: "training" },
] as const;

/** Whether each AI crawler may fetch "/" (its own group wins over `*`). */
export function aiCrawlerAccess(robotsTxt: string | null) {
  const groups = robotsTxt ? robotsGroups(robotsTxt) : new Map<string, string[]>();
  return AI_CRAWLERS.map((c) => {
    const rules = groups.get(c.ua.toLowerCase()) ?? groups.get("*") ?? [];
    return { ...c, allowed: !rules.includes("/") };
  });
}

export function geoTechnicalChecks(facts: SiteFacts): Finding[] {
  const out: Finding[] = [];
  const access = aiCrawlerAccess(facts.robotsTxt);
  const blockedSearch = access.filter((a) => a.purpose === "search" && !a.allowed);
  if (blockedSearch.length) {
    out.push({ id: "ai-search-blocked", category: "AI access", severity: "high", title: `AI search crawlers blocked: ${blockedSearch.map((b) => b.ua).join(", ")}`, detail: "These bots fetch pages when people ask ChatGPT, Perplexity or Claude. Blocking them keeps the brand out of those answers.", fix: "Allow these user-agents in robots.txt. You can still block training-only bots such as GPTBot or CCBot." });
  }
  if (!facts.hasLlmsTxt) {
    out.push({ id: "llms-missing", category: "AI access", severity: "low", title: "No /llms.txt", detail: "An emerging standard that gives AI systems a short guide to the site's key pages and facts.", fix: "Publish /llms.txt: a title, one-line description, then links to main pages with a sentence each." });
  }
  const home = facts.pages[0]?.seo;
  if (home && home.wordCount < 120) {
    out.push({ id: "js-rendered", category: "AI access", severity: "high", title: "Homepage text may need JavaScript", detail: `Only ${home.wordCount} words are in the server HTML. AI crawlers don't run JavaScript, so they may see an almost empty page.`, fix: "Render key content (headings, product names, descriptions) on the server." });
  }
  const types = new Set(facts.pages.flatMap((p) => p.seo?.jsonLdTypes ?? []));
  if (!types.has("Organization") && !types.has("LocalBusiness") && !types.has("Store")) {
    out.push({ id: "entity-schema", category: "Entity", severity: "medium", title: "Brand isn't described as an entity", detail: "No Organization JSON-LD with sameAs links, which AI systems use to connect the site to the brand's other profiles.", fix: "Add Organization JSON-LD with sameAs links to Instagram, Facebook, Pinterest, LinkedIn and Wikipedia/Wikidata if they exist." });
  }
  return out;
}
