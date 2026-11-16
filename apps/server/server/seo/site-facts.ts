import { crawlSite, extractPage, safeFetch } from "@/server/research/crawl";
import type { Finding, SiteFacts } from "@/server/seo/checks";
import { recordApiCall } from "@/server/usage/api-calls";

/** Crawl + robots/sitemap/llms.txt probes shared by the SEO and GEO agents. */
export async function collectSiteFacts(startUrl: string, onPage?: (url: string, title: string | null) => Promise<void>) {
  const { pages, failures, robotsTxt, links } = await crawlSite(startUrl, (p) => onPage?.(p.url, p.title) ?? Promise.resolve());

  // Product pages carry the Product schema and photos that matter most for SEO; the crawl favours
  // shorter collection URLs, so add up to 2 product pages linked from what was read.
  const isProduct = (u: string) => /\/(products?|produits?)\//i.test(new URL(u).pathname);
  if (!pages.some((p) => isProduct(p.url))) {
    for (const url of links.filter(isProduct).slice(0, 2)) {
      const res = await safeFetch(url).catch(() => null);
      if (res?.status !== 200) continue;
      const page = extractPage(res.body, res.url);
      pages.push({ url: res.url.toString(), title: page.title, description: page.description, text: page.text, seo: page.seo });
      await onPage?.(url, page.title);
    }
  }
  const probe = (path: string, accept: string) =>
    safeFetch(new URL(path, startUrl).toString(), accept)
      .then((r) => r.status === 200 && r.body.trim().length > 0)
      .catch(() => false);
  const hasSitemap = /^\s*sitemap:/im.test(robotsTxt ?? "") || (await probe("/sitemap.xml", "application/xml"));
  const hasLlmsTxt = await probe("/llms.txt", "text/plain");
  const facts: SiteFacts = { startUrl, pages, robotsTxt, hasSitemap, hasLlmsTxt };
  return { facts, failures };
}

export type PageSpeed = {
  performance: number;
  seo: number;
  accessibility: number;
  bestPractices: number;
  lcpMs: number | null;
  cls: number | null;
};

/** Google PageSpeed Insights (mobile). Null when no key or Lighthouse can't load the page. */
export async function runPageSpeed(url: string): Promise<{ result: PageSpeed | null; error?: string }> {
  const key = process.env.GOOGLE_PAGESPEED_API_KEY;
  if (!key) return { result: null, error: "GOOGLE_PAGESPEED_API_KEY not set" };
  const qs = new URLSearchParams({ url, strategy: "mobile", key });
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) qs.append("category", c);
  const started = Date.now();
  try {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${qs}`, {
      signal: AbortSignal.timeout(90_000),
    });
    const body = (await res.json()) as {
      error?: { message?: string };
      lighthouseResult?: {
        categories: Record<string, { score: number | null }>;
        audits: Record<string, { numericValue?: number }>;
      };
    };
    const lh = body.lighthouseResult;
    await recordApiCall("google-pagespeed.run", res.ok && !!lh, started);
    if (!res.ok || !lh) return { result: null, error: (body.error?.message ?? `HTTP ${res.status}`).slice(0, 200) };
    const pct = (k: string) => Math.round((lh.categories[k]?.score ?? 0) * 100);
    return {
      result: {
        performance: pct("performance"),
        seo: pct("seo"),
        accessibility: pct("accessibility"),
        bestPractices: pct("best-practices"),
        lcpMs: lh.audits["largest-contentful-paint"]?.numericValue ?? null,
        cls: lh.audits["cumulative-layout-shift"]?.numericValue ?? null,
      },
    };
  } catch (e) {
    return { result: null, error: String(e instanceof Error ? e.message : e).slice(0, 200) };
  }
}

export function pageSpeedFindings(ps: PageSpeed): Finding[] {
  const out: Finding[] = [];
  if (ps.performance < 90) {
    out.push({
      id: "pagespeed-performance",
      category: "Core Web Vitals",
      severity: ps.performance < 50 ? "high" : "medium",
      title: `Mobile performance score ${ps.performance}/100`,
      detail: `Largest Contentful Paint ${ps.lcpMs ? (ps.lcpMs / 1000).toFixed(1) + " s" : "unknown"} (target under 2.5 s), layout shift ${ps.cls?.toFixed(2) ?? "unknown"} (target under 0.1).`,
      fix: "Compress and resize hero/product images (WebP/AVIF), lazy-load below-the-fold images, reduce third-party scripts, reserve space for images to stop layout shifts.",
    });
  }
  if (ps.accessibility < 90) {
    out.push({
      id: "pagespeed-accessibility",
      category: "Accessibility",
      severity: "low",
      title: `Accessibility score ${ps.accessibility}/100`,
      detail: "Lighthouse found accessibility issues (contrast, labels, alt text).",
      fix: "Fix the issues listed in PageSpeed Insights → Accessibility.",
    });
  }
  return out;
}
