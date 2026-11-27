import type { BlogArticleStatus } from "./blog";
import type { DateRange, SearchMetrics, SearchQueryRow, SeoAlertView } from "./data-sources";
import type { TASK_STATUSES, WEBSITE_CHANGE_KINDS } from "./tasks";

// One way to tell when two URLs name the same page, for SEO matching (Search Console rows, audit findings, tasks).
// http and https are the same page, the host is lower-cased and a leading "www." dropped, the fragment and the whole
// query string are dropped (variant, tracking and filter parameters name the same page for SEO), and a trailing slash
// is dropped except on the root. Hosts keep URL's punycode form, so Unicode and punycode spellings meet.
// Ceiling: a site that serves different content per query string sees those pages merged.

function parse(raw: string): { host: string; path: string } | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.host.toLowerCase().replace(/^www\./, "");
  if (!host) return null;
  const path = u.pathname === "/" ? "/" : u.pathname.replace(/\/+$/, "") || "/";
  return { host, path };
}

/** The page a URL names, for matching across http/https, www, a trailing slash, query strings and fragments. Null if not http(s). */
export function urlKey(raw: string): string | null {
  const p = parse(raw);
  return p ? p.host + p.path : null;
}

/**
 * Every stored spelling that has this key (8: http/https × www/none × slash/none; 4 for the root), in URL's encoded
 * form (punycode host, percent-encoded path). Ceiling: a row stored with a Unicode host or a raw non-ASCII path
 * matches none of them; match in JS by urlKey if that turns up.
 */
export function urlVariants(raw: string): string[] {
  const p = parse(raw);
  if (!p) return [];
  const paths = p.path === "/" ? ["/"] : [p.path, p.path + "/"];
  const out: string[] = [];
  for (const scheme of ["http://", "https://"]) for (const host of [p.host, "www." + p.host]) for (const path of paths) out.push(scheme + host + path);
  return out;
}

/** The key's path ("/a/b"), for display and for the digest. */
export function urlPath(raw: string): string | null {
  return parse(raw)?.path ?? null;
}

/**
 * GET seo/url?u=<url>&from&to: one page's SEO story. `url` is rebuilt by the server (https, host, path), never echoed
 * from `u`, so it is safe as a link. `search` null: no Search Console site. `tasks` null: the caller can't see tasks
 * (no tasks.read, or a client reviewer). Findings are matched by urlKey across the last year's audit reports.
 */
export type UrlHistoryDto = {
  url: string;
  key: string;
  range: DateRange;
  search: {
    totals: SearchMetrics;
    previous: SearchMetrics;
    previousRange: DateRange;
    days: (SearchMetrics & { day: string })[];
    topQueries: SearchQueryRow[];
  } | null;
  findings: {
    kind: "SEO" | "GEO";
    findingId: string;
    title: string;
    severity: string;
    firstSeen: string;
    lastSeen: string;
    clearedOn: string | null;
    open: boolean;
  }[];
  tasks: {
    id: string;
    title: string;
    status: (typeof TASK_STATUSES)[number];
    changeKind: (typeof WEBSITE_CHANGE_KINDS)[number] | null;
    dueOn: string | null;
    completedAt: string | null;
    checkedLiveAt: string | null;
    recheckOn: string | null;
    findingClearedAt: string | null;
  }[] | null;
  articles: { id: string; title: string; status: BlogArticleStatus; publishedAt: string | null }[];
  /** The page's decline alerts of the last year (losing clicks or position), newest first. */
  alerts: SeoAlertView[];
};
