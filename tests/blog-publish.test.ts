import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ArticleSpan, BlogArticleDto } from "@/shared";
import { ArticleBody } from "@/components/blog/article-body";
import { fromDraft, shopifyAction, toDraft } from "@/components/blog/blog-board";
import { ShopifyPreviewBody, writesNotice } from "@/components/blog/shopify-dialog";
import type { ArticlePreview } from "@/components/blog/api";
import { NAV, sidebarGroups } from "@/lib/nav";

const s = (text: string, o: Partial<ArticleSpan> = {}): ArticleSpan => ({ text, bold: false, italic: false, href: null, ...o });
const article: BlogArticleDto = {
  id: "a1", title: "Caring for linen", handle: "caring-for-linen", summary: "How to.", tags: ["linen"], productIds: [], taskId: null, status: "APPROVED", version: 3,
  shopifyId: null, publishedAt: null, approvedById: "u2", createdById: "u1", editedById: "u1", updatedAt: "2026-11-24T10:00:00Z",
  blocks: [
    { type: "h2", lines: [[s("Washing")]] },
    { type: "p", lines: [[s("Read "), s("our guide", { href: "https://bc.test/guide" }), s(" and "), s("this", { href: "javascript:alert(1)" })]] },
    { type: "ul", lines: [[s("Cold", { bold: true })], [s("Gentle", { italic: true, href: "https://bc.test/gentle" })]] },
  ],
};
const preview = (over: Partial<ArticlePreview> = {}): ArticlePreview => ({
  preview: {
    blogId: "gid://shopify/Blog/1", title: article.title, handle: article.handle, summary: "How to.", summaryHtml: "<p>How to.</p>", tags: ["linen"], author: "Bois & Chiffons",
    blocks: article.blocks, bodyHtml: "<h2>Washing</h2>", links: ["https://bc.test/guide", "https://elsewhere.test/gentle"], externalLinks: ["https://elsewhere.test/gentle"],
  },
  attempt: 1,
  confirmToken: "t",
  expiresAt: "2026-11-24T10:10:00Z",
  writes: { ready: true },
  last: null,
  ...over,
});
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

describe("the Send to Shopify dialog", () => {
  it("shows the rendered article, every field and every link target", () => {
    const out = html(createElement(ShopifyPreviewBody, { action: "create", preview: preview() }));
    expect(out).toContain("Created hidden");
    expect(out).toContain("<h2");
    expect(out).toContain("<strong>Cold</strong>");
    for (const v of ["Bois &amp; Chiffons", "caring-for-linen", "How to.", "linen"]) expect(out).toContain(v);
    expect(out).toContain("Links in the article (2)");
    expect(out).toContain('href="https://bc.test/guide" target="_blank" rel="noopener noreferrer"');
    expect(out).toContain('href="https://elsewhere.test/gentle"');
    expect(out.match(/Outside your website/g)).toHaveLength(1);
    expect(out.indexOf("Outside your website")).toBeGreaterThan(out.indexOf("elsewhere.test/gentle"));
    expect(out).not.toContain("javascript:");
  });

  it("says when Shopify writes aren't connected yet", () => {
    const out = html(createElement(ShopifyPreviewBody, { action: "create", preview: preview({ writes: { ready: false, reason: "NOT_CONNECTED" } }) }));
    expect(out).toContain("Shopify writes aren&#x27;t connected yet. Nothing will be sent.");
    expect(writesNotice({ ready: false, reason: "MISSING_SCOPE", scope: "write_content" })).toMatch(/missing write_content/);
    expect(writesNotice({ ready: true })).toBeNull();
  });

  it("publish shows the article it makes visible", () => {
    const out = html(createElement(ShopifyPreviewBody, { action: "publish", preview: preview({ preview: { shopifyId: "gid://shopify/Article/1", title: article.title, handle: article.handle } }) }));
    expect(out).toContain("Makes the article visible on the store");
    expect(out).toContain("caring-for-linen");
  });

  it("offers the step the article is ready for", () => {
    expect(shopifyAction({ status: "IN_REVIEW", shopifyId: null })).toBeNull();
    expect(shopifyAction({ status: "APPROVED", shopifyId: null })).toBe("create");
    expect(shopifyAction({ status: "APPROVED", shopifyId: "x" })).toBe("update");
    expect(shopifyAction({ status: "HIDDEN_IN_SHOPIFY", shopifyId: "x" })).toBe("publish");
    expect(shopifyAction({ status: "PUBLISHED", shopifyId: "x" })).toBeNull();
  });
});

describe("the article editor", () => {
  it("round-trips blocks through the text form, dropping empty lines", () => {
    const safe = article.blocks.filter((b) => b.type !== "p");
    expect(fromDraft(toDraft(safe))).toEqual(safe);
    expect(fromDraft([{ type: "p", text: "One\n\ntwo" }, { type: "ul", text: "a\n\nb" }, { type: "h2", text: "  " }])).toEqual([
      { type: "p", lines: [[s("One two")]] },
      { type: "ul", lines: [[s("a")], [s("b")]] },
    ]);
  });

  it("renders a link only for http(s)", () => {
    const out = html(createElement(ArticleBody, { blocks: article.blocks }));
    expect(out).toContain('href="https://bc.test/guide"');
    expect(out).not.toContain("javascript:");
    expect(out).toContain(" and this</p>");
  });
});

describe("Blog in the nav", () => {
  it("shows only with the blog flag", () => {
    expect(NAV.find((e) => e.id === "blog")).toMatchObject({ href: "/blog", feature: "blog" });
    expect(sidebarGroups(["tasks"], ["brand.read", "tasks.read"])[0]!.entries.map((e) => e.id)).not.toContain("blog");
    expect(sidebarGroups(["blog"], ["brand.read"])[0]!.entries.map((e) => e.id)).toContain("blog");
  });
});
