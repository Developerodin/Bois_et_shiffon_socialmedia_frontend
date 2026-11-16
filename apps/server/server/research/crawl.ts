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
  if (v6.startsWith("::ffff:")) {
    // IPv4-mapped: "::ffff:127.0.0.1", or the hex form URL parsing produces ("::ffff:7f00:1").
    const rest = v6.slice(7);
    if (isIP(rest) === 4) return isPrivateAddress(rest);
    const hex = rest.match(/^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (!hex) return true;
    const [hi, lo] = [parseInt(hex[1], 16), parseInt(hex[2], 16)];
    return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  return (
    // Everything in ::/8 is reserved (incl. IPv4-compatible "::7f00:1"); 64:ff9b:: (NAT64) and
    // 2002:: (6to4) embed an IPv4 address we can't vouch for.
    v6.startsWith("::") || v6.startsWith("64:ff9b:") || v6.startsWith("2002:") ||
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
export async function safeFetch(raw: string, accept = "text/html", signal?: AbortSignal): Promise<{ url: URL; status: number; body: string; contentType: string }> {
  const { url, status, bytes, contentType } = await safeFetchBytes(raw, accept, MAX_BYTES, signal);
  return { url, status, body: Buffer.from(bytes).toString("utf8"), contentType };
}

/** Same guard as safeFetch, raw bytes (images). `truncated` = the body hit maxBytes and was cut. `signal` = caller's overall deadline. */
export async function safeFetchBytes(raw: string, accept: string, maxBytes = MAX_BYTES, signal?: AbortSignal, timeoutMs = TIMEOUT_MS): Promise<{ url: URL; status: number; bytes: Uint8Array; contentType: string; truncated: boolean }> {
  let url = await assertPublicUrl(raw);
  for (let hop = 0; hop < 4; hop++) {
    const res = await fetch(url, {
      redirect: "manual",
      headers: { "user-agent": USER_AGENT, accept },
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      await res.body?.cancel();
      url = await assertPublicUrl(new URL(res.headers.get("location")!, url).toString());
      continue;
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let truncated = false;
    while (reader) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        truncated = true;
        await reader.cancel();
        break;
      }
      chunks.push(value);
    }
    return {
      url,
      status: res.status,
      bytes: Buffer.concat(chunks),
      contentType: res.headers.get("content-type") ?? "",
      truncated,
    };
  }
  throw new CrawlError("Too many redirects");
}

/** Disallow rules per user-agent (lower-cased). Consecutive User-agent lines share one group. */
export function robotsGroups(txt: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let agents: string[] = [];
  let inRules = false;
  for (const line of txt.split(/\r?\n/)) {
    const [k, ...rest] = line.split("#")[0].split(":");
    const key = k?.trim().toLowerCase();
    const value = rest.join(":").trim();
    if (key === "user-agent") {
      if (inRules) agents = [];
      inRules = false;
      const ua = value.toLowerCase();
      agents.push(ua);
      if (!groups.has(ua)) groups.set(ua, []);
    } else if (key === "disallow" || key === "allow") {
      inRules = true;
      if (key === "disallow" && value) for (const a of agents) groups.get(a)!.push(value);
    }
  }
  return groups;
}

/** Disallow rules for `User-agent: *` (simple prefix match; ponytail: no wildcards/Allow precedence). */
export function parseRobots(txt: string): string[] {
  return robotsGroups(txt).get("*") ?? [];
}

const decode = (s: string) =>
  s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;/g, "'")
    // Numeric entities, decimal or hex; out-of-range code points (a crafted page) are dropped, never thrown on.
    .replace(/&#(\d{1,10}|x[0-9a-f]{1,8});/gi, (_, n: string) => {
      const cp = n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n);
      return cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
    });

/** Readable text of an HTML page or fragment: scripts and styles dropped, entities decoded, blank lines collapsed. */
export function htmlText(html: string) {
  return decode(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export function extractPage(html: string, base: URL) {
  const title = decode(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "") || null;
  const description = tagAttrs(html, "meta").find((m) => m.name?.toLowerCase() === "description")?.content || null;
  const text = htmlText(html).slice(0, MAX_TEXT);
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
  return { title, description, text, links: [...links], seo: seoSignals(html), assets: pageAssets(html, base) };
}

/** Attributes of every `<tag …>` in any order, quoted or not (keys lower-cased, values decoded). */
export function tagAttrs(html: string, tag: string): Record<string, string>[] {
  // [^<>]: an unterminated tag stops at the next "<" instead of scanning to the end of the page (quadratic on hostile pages).
  return [...html.matchAll(new RegExp(`<${tag}\\b([^<>]*)>`, "gi"))].map((m) => {
    const attrs: Record<string, string> = {};
    for (const a of m[1].matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g)) {
      attrs[a[1].toLowerCase()] = decode((a[2] ?? a[3] ?? a[4] ?? "").trim());
    }
    return attrs;
  });
}

const SOCIAL_HOSTS: [string, RegExp][] = [
  ["instagram", /(^|\.)instagram\.com$/],
  ["facebook", /(^|\.)facebook\.com$/],
  ["pinterest", /(^|\.)pinterest\.[a-z.]+$/],
  ["tiktok", /(^|\.)tiktok\.com$/],
  ["youtube", /(^|\.)youtube\.com$/],
  ["linkedin", /(^|\.)linkedin\.com$/],
  ["x", /(^|\.)(x|twitter)\.com$/],
  ["threads", /(^|\.)threads\.(net|com)$/],
];

/** Brand profile links found on a page (first per platform; share/intent links skipped). */
export function socialLinks(hrefs: string[]) {
  const found = new Map<string, string>();
  for (const href of hrefs) {
    let u: URL;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (u.protocol !== "https:" && u.protocol !== "http:") continue;
    if (/\/(sharer|share|intent|pin\/create|dialog)\b/i.test(u.pathname) || u.pathname.length < 2) continue;
    const platform = SOCIAL_HOSTS.find(([, re]) => re.test(u.hostname))?.[0];
    if (platform && !found.has(platform)) found.set(platform, `${u.origin}${u.pathname}`.replace(/\/$/, ""));
  }
  return [...found].map(([platform, url]) => ({ platform, url }));
}

/** On-page SEO signals from the raw (server-rendered) HTML — what crawlers without JS see. */
export function seoSignals(html: string) {
  const metas = tagAttrs(html, "meta");
  const links = tagAttrs(html, "link");
  const meta = (key: "name" | "property", value: string) =>
    metas.find((m) => m[key]?.toLowerCase() === value)?.content || null;
  const rel = (l: Record<string, string>, value: string) => (l.rel ?? "").toLowerCase().split(/\s+/).includes(value);
  const images = tagAttrs(html, "img");
  const jsonLdTypes = new Set<string>();
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const t of m[1].matchAll(/"@type"\s*:\s*(?:"([^"]+)"|\[([^\]]+)\])/g)) {
      (t[1] ?? t[2]).split(",").forEach((x) => jsonLdTypes.add(x.replace(/"/g, "").trim()));
    }
  }
  const bodyText = html
    .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return {
    lang: tagAttrs(html, "html")[0]?.lang || null,
    canonical: links.find((l) => rel(l, "canonical"))?.href || null,
    robots: meta("name", "robots"),
    viewport: meta("name", "viewport") !== null,
    ogImage: meta("property", "og:image") !== null,
    h1Count: (html.match(/<h1\b/gi) ?? []).length,
    h2Count: (html.match(/<h2\b/gi) ?? []).length,
    hreflang: links.filter((l) => l.hreflang).map((l) => l.hreflang),
    jsonLdTypes: [...jsonLdTypes],
    imageCount: images.length,
    // alt="" is the correct markup for decorative images, so only a missing attribute counts.
    imagesMissingAlt: images.filter((i) => !("alt" in i)).length,
    wordCount: bodyText.split(/\s+/).filter(Boolean).length,
    socials: socialLinks(tagAttrs(html, "a").map((a) => a.href ?? "")),
  };
}
export type PageSeo = ReturnType<typeof seoSignals>;

type LdNode = Record<string, unknown>;

/** Every object in the page's JSON-LD (arrays, @graph and nested objects flattened); broken blocks skipped. */
function jsonLdNodes(html: string): LdNode[] {
  const out: LdNode[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      out.push(v as LdNode);
      Object.values(v).forEach(walk);
    }
  };
  // Opening tags can't contain "<", and the body ends at the next "</script": both keep this linear on hostile
  // pages (an unterminated `<script ` repeated over 1 MB would otherwise backtrack quadratically).
  const lower = html.toLowerCase();
  for (const m of html.matchAll(/<script\b([^<>]*)>/gi)) {
    if (!/application\/ld\+json/i.test(m[1])) continue;
    const start = m.index + m[0].length;
    const end = lower.indexOf("</script", start);
    if (end < 0) break;
    try {
      walk(JSON.parse(html.slice(start, end)));
    } catch {
      // broken JSON-LD is common; skip the block
    }
  }
  return out;
}

/** JSON-LD image fields: a URL, a list, or an ImageObject. */
const ldImage = (v: unknown): string | undefined => {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return ldImage(v[0]);
  if (v && typeof v === "object") return ldImage((v as LdNode).url ?? (v as LdNode).contentUrl);
  return undefined;
};

const GENERIC_FONT = /^(serif|sans-serif|monospace|cursive|fantasy|system-ui|ui-[a-z-]+|inherit|initial|unset|revert|var\(.*|-apple-system|blinkmacsystemfont|arial|helvetica( neue)?|times( new roman)?|segoe ui|roboto|georgia)$/i;
const ICON_FONT = /icon|awesome|material|star|swiper|slick|glyph|dashicon|fontello|social/i;

const cleanFont = (f: string) => f.replace(/["'+]/g, " ").replace(/!important/i, "").replace(/\s+/g, " ").trim();

/**
 * Font families used in HTML or CSS (`font-family:` incl. inside `@font-face`), one entry per use; generic and
 * icon fonts dropped, and so are declarations falling back to `monospace` (countdowns, prices, code: not brand type).
 */
export function fontFamilies(text: string): string[] {
  // First family only: `"Poppins"`, `'Poppins'` or a bare name (which in a style="" attribute ends at the quote).
  // (?<![\w-]): not `--font-family:` custom properties or vendor-prefixed names.
  return [...text.matchAll(/(?<![\w-])font-family\s*:\s*(?:(["'])([^"'<>;}]+)\1|([^,"'<>;}]+))([^;}<>"]*)/gi)]
    .filter((m) => !/\bmonospace\b/i.test(m[4]))
    .map((m) => cleanFont(m[2] ?? m[3]))
    .filter((f) => f && !GENERIC_FONT.test(f) && !ICON_FONT.test(f));
}

const GENERIC_NAME = /^(home|accueil|homepage|shop|store|boutique|index|welcome|bienvenue|shopify|wordpress|wix|squarespace)$/i;

/**
 * A brand name read from a web page, as plain text: it ends up in AI prompts and emails. NFKC folds fullwidth
 * and compatibility forms; control, format (zero-width, bidi, tag "smuggling" characters) and private-use
 * characters and angle brackets are removed. URLs, and sentence-like text (a colon, more than 8 words), are refused:
 * real brand names are short, instructions aren't.
 */
export function cleanBrandName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = decode(raw)
    .normalize("NFKC")
    .replace(/[\p{Cc}\p{Cf}\p{Co}<>]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length < 2 || name.length > 80 || GENERIC_NAME.test(name)) return null;
  if (/:\/\/|www\.|\.(com|fr|net|org|io|shop|store|co)\b/i.test(name)) return null;
  if (name.includes(":") || name.split(" ").length > 8) return null;
  return name;
}

const sameSite = (a: string, b: string) => a.replace(/^www\./, "") === b.replace(/^www\./, "");
// App and widget sheets (cart drawers, reviews, wallets) say nothing about the brand's type.
const SKIP_CSS = /component-|vendor|judge|wallet|checkout|shopifycloud|\/apps?\//i;
const THEME_CSS = /\/assets\/(?:[^/]*[-_.])?(base|theme|custom|main|style|styles|global)[^/]*\.css/i;

export type PageProduct = { title: string; url: string; image: string | null };

/**
 * Brand assets a page points at (parsing only, nothing fetched): logo candidates best first,
 * JSON-LD products, font families, CSS colours. SVG is skipped: we never store or render it.
 */
export function pageAssets(html: string, base: URL) {
  const abs = (s: unknown) => {
    if (typeof s !== "string" || !s.trim()) return null;
    try {
      const u = new URL(decode(s.trim()), base);
      return (u.protocol === "https:" || u.protocol === "http:") && !/\.svgz?$/i.test(u.pathname) ? u.toString() : null;
    } catch {
      return null;
    }
  };
  const nodes = jsonLdNodes(html);
  const types = (n: LdNode) => [n["@type"]].flat().map(String);

  const logos = [
    ...nodes.map((n) => abs(ldImage(n.logo))),
    ...tagAttrs(html, "img")
      // class/id only: alt/src "logo" also matches footer payment and partner badges
      .filter((i) => /logo/i.test(`${i.class ?? ""} ${i.id ?? ""}`))
      .map((i) => abs(i.src)),
  ].filter((u): u is string => u !== null);
  // Site icons are a last resort: often a favicon (ICO) or a square mark rather than the logo.
  const icons = ["apple-touch-icon", "icon", "shortcut icon"]
    .flatMap((r) => tagAttrs(html, "link").filter((l) => (l.rel ?? "").toLowerCase() === r).map((l) => abs(l.href)))
    .filter((u): u is string => u !== null);

  const products: PageProduct[] = nodes
    .filter((n) => types(n).includes("Product") && typeof n.name === "string")
    .map((n) => ({ title: decode(String(n.name)).slice(0, 200), url: abs(n.url) ?? base.toString(), image: abs(ldImage(n.image)) }));

  const links = tagAttrs(html, "link");
  const fonts: string[] = [];
  for (const l of links) {
    if (!/fonts\.googleapis\.com/i.test(l.href ?? "")) continue;
    try {
      for (const f of new URL(l.href, base).searchParams.getAll("family")) fonts.push(...f.split("|").map((x) => cleanFont(x.split(":")[0])));
    } catch {
      // malformed font link
    }
  }
  fonts.push(...fontFamilies(html));

  // The brand's own theme sheets (same site, www or not, or Shopify's CDN), theme-looking files first.
  const stylesheets = links
    .filter((l) => (l.rel ?? "").toLowerCase().split(/\s+/).includes("stylesheet"))
    .flatMap((l) => {
      try {
        const u = new URL(decode(l.href ?? ""), base);
        const ours = sameSite(u.hostname, base.hostname) || (u.hostname === "cdn.shopify.com" && u.pathname.includes("/assets/"));
        return (u.protocol === "https:" || u.protocol === "http:") && ours && !SKIP_CSS.test(u.pathname) ? [u.toString()] : [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => Number(THEME_CSS.test(new URL(b).pathname)) - Number(THEME_CSS.test(new URL(a).pathname)))
    .slice(0, 4);

  const metas = tagAttrs(html, "meta");
  const siteName =
    cleanBrandName(metas.find((m) => m.property?.toLowerCase() === "og:site_name")?.content) ??
    nodes.filter((n) => types(n).some((t) => ["Organization", "Corporation", "Store", "OnlineStore", "WebSite"].includes(t))).map((n) => cleanBrandName(n.name)).find(Boolean) ??
    cleanBrandName(metas.find((m) => m.name?.toLowerCase() === "application-name")?.content);

  const themeColor = metas.find((m) => m.name?.toLowerCase() === "theme-color")?.content || null;
  // Theme CSS variables include unused colour schemes and theme defaults (Shopify Dawn's blue), so they rank last.
  const cssColors = [...html.matchAll(/--color[\w-]*\s*:\s*([^;}"]+)/gi)].map((m) => m[1]);

  return {
    logos: [...new Set(logos)],
    icons: [...new Set(icons)].filter((u) => !logos.includes(u)),
    /** Logos drawn as inline SVG in the page (no image file), only ones safe to render. */
    inlineLogos: inlineSvgLogos(html, base),
    products,
    /** One entry per use (repeats kept), so callers can rank by use. */
    fonts: fonts.filter((f) => f && !GENERIC_FONT.test(f) && !ICON_FONT.test(f)),
    siteName: siteName ?? null,
    stylesheets,
    themeColor,
    cssColors,
  };
}
export type PageAssets = ReturnType<typeof pageAssets>;

const MAX_INLINE_SVG = 100_000;
/** Anything that could run code or reach outside the drawing: such SVGs are never rendered. */
const SVG_FORBIDDEN = /<script|<foreignObject|<image\b|<iframe|<embed|<object|<!DOCTYPE|<!ENTITY|@import|javascript:|data:/i;

/** Self-contained drawing only: every href and url() points inside the SVG (#id). */
export function safeSvg(svg: string) {
  if (svg.length > MAX_INLINE_SVG || SVG_FORBIDDEN.test(svg)) return false;
  for (const m of svg.matchAll(/(?:xlink:)?href\s*=\s*["']([^"']*)["']/gi)) if (!m[1].startsWith("#")) return false;
  for (const m of svg.matchAll(/url\(\s*['"]?([^'")]*)/gi)) if (!m[1].startsWith("#")) return false;
  return true;
}

/**
 * Logos drawn as inline <svg> (no image file to download): an SVG inside the link to the homepage, or labelled
 * "logo", or one that draws a "logo" symbol defined elsewhere on the page (<use href="#…logo…">), made standalone.
 * Returns up to 3, each passing safeSvg. ponytail: regex over the HTML, like the rest of this parser.
 */
function inlineSvgLogos(html: string, base: URL): string[] {
  const symbols = new Map<string, string>();
  for (const m of html.matchAll(/<symbol\b([^>]*)>[\s\S]*?<\/symbol>/gi)) {
    const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(m[1])?.[1];
    if (id) symbols.set(id, m[0]);
  }
  const homeLink = (before: string) => {
    const open = before.lastIndexOf("<a ");
    if (open < 0 || before.lastIndexOf("</a>") > open) return false;
    const href = /\bhref\s*=\s*["']([^"']*)["']/i.exec(before.slice(open))?.[1];
    try {
      const u = new URL(decode(href ?? "x:"), base);
      // the site root, or a locale root like /gb/en/
      return sameSite(u.hostname, base.hostname) && /^\/([a-z]{2}([-_][a-z]{2})?\/?){0,2}$/i.test(u.pathname);
    } catch {
      return false;
    }
  };
  const out: string[] = [];
  for (const m of html.matchAll(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi)) {
    if (out.length >= 3) break;
    const svg = m[0];
    if (svg.length > MAX_INLINE_SVG) continue;
    const open = /^<svg\b[^>]*>/i.exec(svg)![0];
    const use = /<use\b[^>]*href\s*=\s*["']#([^"']+)["']/i.exec(svg)?.[1];
    const labelled = /logo/i.test(open) || /logo/i.test(use ?? "");
    if (!labelled && !homeLink(html.slice(Math.max(0, m.index! - 600), m.index!))) continue;
    // Small square drawings in the header link are interface icons (heart, cart, dot), not the logo.
    const box = /\bviewBox\s*=\s*["'][\d.-]+[\s,]+[\d.-]+[\s,]+([\d.]+)[\s,]+([\d.]+)["']/i.exec(open);
    const attr = (name: string) => Number(new RegExp(`\\b${name}\\s*=\\s*["']?([\\d.]+)`, "i").exec(open)?.[1] ?? 0);
    const [w, h] = box ? [Number(box[1]), Number(box[2])] : [attr("width"), attr("height")];
    if (!labelled && w > 0 && w <= 64 && h <= 64 && w / h >= 0.75 && w / h <= 1.33) continue;
    let markup = svg;
    if (use && !/<(path|g|rect|circle|polygon|text)\b/i.test(svg)) {
      // Only a reference: draw the referenced symbol as its own SVG.
      const symbol = symbols.get(use);
      const viewBox = symbol && /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(symbol)?.[1];
      if (!symbol || !viewBox) continue;
      markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${symbol.replace(/^<symbol\b[^>]*>/i, "").replace(/<\/symbol>$/i, "")}</svg>`;
    } else if (!/\bxmlns\s*=/.test(open)) {
      markup = svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
    }
    if (safeSvg(markup) && !out.includes(markup)) out.push(markup);
  }
  return out;
}

const PRIORITY = /about|a-propos|histoire|story|qui-sommes|collection|produit|product|shop|boutique|catalog|materi|savoir/i;

export type CrawledPage = { url: string; title: string | null; description: string | null; text: string; seo?: PageSeo; assets?: PageAssets };

export async function crawlSite(startUrl: string, onPage?: (p: CrawledPage) => Promise<void>) {
  const start = await assertPublicUrl(startUrl);
  const robotsTxt = await safeFetch(new URL("/robots.txt", start).toString(), "text/plain")
    .then((r) => (r.status === 200 ? r.body : null))
    .catch(() => null);
  const disallow = robotsTxt ? parseRobots(robotsTxt) : [];
  const allowed = (u: string) => !disallow.some((rule) => new URL(u).pathname.startsWith(rule));

  const queue = [start.toString()];
  const seen = new Set(queue);
  const discovered = new Set<string>(); // every same-origin link seen, for callers that need more than MAX_PAGES
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
      const crawled = { url: res.url.toString(), title: page.title, description: page.description, text: page.text, seo: page.seo, assets: page.assets };
      pages.push(crawled);
      await onPage?.(crawled);
      page.links.forEach((l) => discovered.add(l));
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
  return { pages, failures, robotsTxt, links: [...discovered] };
}
