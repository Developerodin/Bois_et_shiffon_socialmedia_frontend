import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Brand-website crawler for the Research agent (design §5.1).
 * Untrusted URLs → SSRF guard on every hop: http(s) only, default ports, no
 * credentials, every resolved address must be public. Respects robots.txt (User-agent: *).
 * ponytail: DNS is checked before fetch, but fetch re-resolves (rebinding window);
 * pin the resolved IP with a custom undici dispatcher if this ever crawls hostile hosts at scale.
 */
export const USER_AGENT = "BrandpilotResearchBot/0.1 (+brand onboarding)";
const MAX_PAGES = 8;
const MAX_BYTES = 1_000_000;
const MAX_TEXT = 8_000;
const TIMEOUT_MS = 10_000;

export class CrawlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrawlError";
  }
}

export function isPrivateAddress(ip: string): boolean {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const v6 = ip.toLowerCase();
  if (v6.startsWith("::ffff:")) return isPrivateAddress(v6.slice(7));
  return (
    v6 === "::" || v6 === "::1" ||
    v6.startsWith("fc") || v6.startsWith("fd") ||
    v6.startsWith("fe8") || v6.startsWith("fe9") || v6.startsWith("fea") || v6.startsWith("feb") ||
    v6.startsWith("ff")
  );
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new CrawlError("Invalid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new CrawlError("Only http(s) URLs are allowed");
  if (url.username || url.password) throw new CrawlError("URLs with credentials are not allowed");
  if (url.port && url.port !== "80" && url.port !== "443") throw new CrawlError("Non-standard ports are not allowed");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => []);
  if (addresses.length === 0) throw new CrawlError(`Cannot resolve ${host}`);
  if (addresses.some((a) => isPrivateAddress(a.address))) throw new CrawlError("Private or local addresses are not allowed");
  url.hash = "";
  return url;
}

/** Fetch with SSRF check on each redirect hop, timeout and size cap. */
export async function safeFetch(raw: string, accept = "text/html"): Promise<{ url: URL; status: number; body: string; contentType: string }> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return {
      url,
      status: res.status,
      body: Buffer.concat(chunks).toString("utf8"),
      contentType: res.headers.get("content-type") ?? "",
    };
  }
  throw new CrawlError("Too many redirects");
}

/** Disallow rules for `User-agent: *` (simple prefix match; ponytail: no wildcards/Allow precedence). */
export function parseRobots(txt: string): string[] {
  const rules: string[] = [];
  let applies = false;
  for (const line of txt.split(/\r?\n/)) {
    const [k, ...rest] = line.split("#")[0].split(":");
    const key = k?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") applies = value === "*";
    else if (applies && key === "disallow" && value) rules.push(value);
  }
  return rules;
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

export function extractPage(html: string, base: URL) {
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "") || null;
  const description = decode(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i.exec(html)?.[1] ?? "") || null;
  const text = decode(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim()
    .slice(0, MAX_TEXT);
  const links = new Set<string>();
  for (const m of html.matchAll(/<a[^>]+href=["']([^"'#]+)/gi)) {
    try {
      const u = new URL(m[1], base);
      if (u.origin === base.origin && !/\.(jpe?g|png|gif|webp|svg|pdf|zip|mp4)$/i.test(u.pathname)) {
        u.hash = "";
        u.search = "";
        links.add(u.toString());
      }
    } catch {
      // ignore malformed hrefs
    }
  }
  return { title, description, text, links: [...links] };
}

const PRIORITY = /about|a-propos|histoire|story|qui-sommes|collection|produit|product|shop|boutique|catalog|materi|savoir/i;

export type CrawledPage = { url: string; title: string | null; description: string | null; text: string };

export async function crawlSite(startUrl: string, onPage?: (p: CrawledPage) => Promise<void>) {
  const start = await assertPublicUrl(startUrl);
  const disallow = await safeFetch(new URL("/robots.txt", start).toString(), "text/plain")
    .then((r) => (r.status === 200 ? parseRobots(r.body) : []))
    .catch(() => []);
  const allowed = (u: string) => !disallow.some((rule) => new URL(u).pathname.startsWith(rule));

  const queue = [start.toString()];
  const seen = new Set(queue);
  const pages: CrawledPage[] = [];
  const failures: Array<{ url: string; error: string }> = [];

  while (queue.length && pages.length < MAX_PAGES) {
    const next = queue.shift()!;
    if (!allowed(next)) {
      failures.push({ url: next, error: "disallowed by robots.txt" });
      continue;
    }
    try {
      const res = await safeFetch(next);
      if (res.status !== 200 || !res.contentType.includes("html")) {
        failures.push({ url: next, error: `HTTP ${res.status} ${res.contentType}` });
        continue;
      }
      const page = extractPage(res.body, res.url);
      const crawled = { url: res.url.toString(), title: page.title, description: page.description, text: page.text };
      pages.push(crawled);
      await onPage?.(crawled);
      const fresh = page.links.filter((l) => !seen.has(l));
      fresh.sort((a, b) => Number(PRIORITY.test(b)) - Number(PRIORITY.test(a)) || a.length - b.length);
      for (const l of fresh.slice(0, 30)) {
        seen.add(l);
        queue.push(l);
      }
    } catch (error) {
      failures.push({ url: next, error: String(error instanceof Error ? error.message : error) });
    }
  }
  return { pages, failures };
}
