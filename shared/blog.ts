/**
 * Blog articles (server/blog/*): written in our app, sent to the brand's Shopify blog hidden, published when a person
 * says so. The body is structured blocks; the server renders them to HTML from an allow-list (server/blog/render.ts)
 * and the web renders them as React elements.
 */

/** A run of text: bold, italic and an http(s) link are the only formatting there is. */
export type ArticleSpan = { text: string; bold: boolean; italic: boolean; href: string | null };
/** h2/h3/p: one line in `lines`; ul/ol: one line per item. */
export type ArticleBlock = { type: "h2" | "h3" | "p" | "ul" | "ol"; lines: ArticleSpan[][] };

export type BlogArticleStatus = "DRAFT" | "IN_REVIEW" | "APPROVED" | "HIDDEN_IN_SHOPIFY" | "PUBLISHED" | "ARCHIVED";

export const ARTICLE_LIMITS = { title: 200, handle: 120, summary: 500, chars: 30_000, blocks: 200, lines: 50, spans: 50, tags: 20, tag: 60, products: 10 } as const;

export type BlogArticleDto = {
  id: string;
  title: string;
  handle: string;
  summary: string | null;
  blocks: ArticleBlock[];
  tags: string[];
  productIds: string[];
  taskId: string | null;
  status: BlogArticleStatus;
  version: number;
  shopifyId: string | null;
  publishedAt: string | null;
  approvedById: string | null;
  createdById: string | null;
  editedById: string | null;
  updatedAt: string;
};

/**
 * What a Shopify article write sends (ARTICLE_CREATE / ARTICLE_UPDATE). `blocks` is the body `bodyHtml` is rendered
 * from (the dialog shows them); every link target is in `links`, and those off the brand's website in `externalLinks`.
 */
export type ArticleWritePreview = {
  /** null only while Shopify writes aren't connected (the confirm is then refused) */
  blogId: string | null;
  title: string;
  handle: string;
  /** shown to the person; Shopify gets `summaryHtml` (escaped, in a paragraph) */
  summary: string;
  summaryHtml: string;
  tags: string[];
  author: string;
  blocks: ArticleBlock[];
  bodyHtml: string;
  links: string[];
  externalLinks: string[];
};
/** ARTICLE_PUBLISH: the article Shopify shows from then on. */
export type ArticlePublishPreview = { shopifyId: string; title: string; handle: string };
export type ArticleShopifyAction = "create" | "update" | "publish";
/** The brand's Shopify blogs; articles go to `selectedId` when picked, else the first (`defaultId`). */
export type ShopifyBlogsDto = { blogs: { id: string; title: string }[]; selectedId: string | null; defaultId: string | null; connected: boolean };

/** The plain text of a line, with links shown as [text](url), bold as **text** and italic as *text*: the web editor's format. */
export function spansToText(spans: ArticleSpan[]): string {
  return spans
    .map((s) => {
      let t = s.text;
      if (s.italic) t = `*${t}*`;
      if (s.bold) t = `**${t}**`;
      return s.href ? `[${t}](${s.href})` : t;
    })
    .join("");
}

const MARK = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|(\*{1,3})([^*]+)\3/g;
/** `*` italic, `**` bold, `***` both. */
const emphasis = (stars: string) => ({ bold: stars.length >= 2, italic: stars.length !== 2 });
/** spansToText read back. Only http(s) links become links; anything else stays text. */
export function textToSpans(text: string): ArticleSpan[] {
  const out: ArticleSpan[] = [];
  const plain = (t: string) => t && out.push({ text: t, bold: false, italic: false, href: null });
  let at = 0;
  for (const m of text.matchAll(MARK)) {
    plain(text.slice(at, m.index));
    if (m[1] !== undefined) {
      const inner = m[1].match(/^(\*{1,3})([^*]+)\1$/);
      out.push({ text: inner ? inner[2]! : m[1], ...(inner ? emphasis(inner[1]!) : { bold: false, italic: false }), href: m[2]! });
    } else out.push({ text: m[4]!, ...emphasis(m[3]!), href: null });
    at = m.index + m[0].length;
  }
  plain(text.slice(at));
  return out;
}
