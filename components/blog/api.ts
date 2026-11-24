// Client-side contract for the blog API (app/api/v1/.../brands/[brandId]/blog). Keep in sync with the routes.
import { request } from "@/components/settings/api";
import type { ArticlePublishPreview, ArticleShopifyAction, ArticleWritePreview, BlogArticleDto, ShopifyBlogsDto, ShopifyWritePreview } from "@/shared";

export type ArticlePatch = Partial<Pick<BlogArticleDto, "title" | "handle" | "summary" | "blocks" | "tags" | "productIds">> & { version: number };
export type ArticlePreview = ShopifyWritePreview<ArticleWritePreview | ArticlePublishPreview>;

const base = (w: string, b: string) => `/api/v1/workspaces/${encodeURIComponent(w)}/brands/${encodeURIComponent(b)}/blog`;
const one = (w: string, b: string, id: string) => `${base(w, b)}/articles/${encodeURIComponent(id)}`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const blogApi = {
  list: (w: string, b: string) => request<{ articles: BlogArticleDto[] }>(`${base(w, b)}/articles`),
  get: (w: string, b: string, id: string) => request<{ article: BlogArticleDto }>(one(w, b, id)),
  create: (w: string, b: string, body: { topic?: string; taskId?: string }) => request<{ article: BlogArticleDto }>(`${base(w, b)}/articles`, json("POST", body)),
  update: (w: string, b: string, id: string, body: ArticlePatch) => request<{ article: BlogArticleDto }>(one(w, b, id), json("PATCH", body)),
  remove: (w: string, b: string, id: string) => request<void>(one(w, b, id), { method: "DELETE" }),
  /** The article writer: up to a minute, costs credits (given back if it fails). */
  write: (w: string, b: string, id: string) => request<{ article: BlogArticleDto }>(`${one(w, b, id)}/write`, { method: "POST", timeoutMs: 180_000 }),
  decide: (w: string, b: string, id: string, body: { version: number; verdict: "APPROVED" | "CHANGES_REQUESTED"; note?: string }) =>
    request<{ article: BlogArticleDto }>(`${one(w, b, id)}/decide`, json("POST", body)),
  blogs: (w: string, b: string) => request<ShopifyBlogsDto>(`${base(w, b)}/shopify-blogs`),
  preview: (w: string, b: string, id: string, action: ArticleShopifyAction) => request<ArticlePreview>(`${one(w, b, id)}/shopify/preview`, json("POST", { action })),
  confirm: (w: string, b: string, id: string, action: ArticleShopifyAction, confirmToken: string) =>
    request<{ article: BlogArticleDto }>(`${one(w, b, id)}/shopify/confirm`, json("POST", { action, confirmToken })),
};
