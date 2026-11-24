// Client-side contract for the quotes API (app/api/v1/.../brands/[brandId]/quotes). Keep in sync with the routes.
import { request } from "@/components/settings/api";
import type { DraftOrderWritePreview, InvoiceEmailInput, InvoiceWritePreview, QuoteDiscount, QuoteDto, QuoteLineInput, QuoteShopifyAction, ShopifyWritePreview } from "@/shared";

/** What the editor sends. Totals never: the server works them out and answers with the quote. */
export type QuoteBody = {
  contactName?: string | null;
  contactEmail?: string | null;
  lines?: QuoteLineInput[];
  discount?: QuoteDiscount | null;
  note?: string | null;
  internalNote?: string | null;
  currency?: string;
};
export type QuotePreview = ShopifyWritePreview<DraftOrderWritePreview | InvoiceWritePreview>;

const base = (w: string, b: string) => `/api/v1/workspaces/${encodeURIComponent(w)}/brands/${encodeURIComponent(b)}/quotes`;
const one = (w: string, b: string, id: string) => `${base(w, b)}/${encodeURIComponent(id)}`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const quotesApi = {
  list: (w: string, b: string) => request<{ quotes: QuoteDto[] }>(base(w, b)),
  get: (w: string, b: string, id: string) => request<{ quote: QuoteDto }>(one(w, b, id)),
  create: (w: string, b: string, body: QuoteBody) => request<{ quote: QuoteDto }>(base(w, b), json("POST", body)),
  update: (w: string, b: string, id: string, body: QuoteBody & { version: number }) => request<{ quote: QuoteDto }>(one(w, b, id), json("PATCH", body)),
  /** revise: a sent quote back to editable; acceptSubtotal: go with Shopify's subtotal where it differs. */
  act: (w: string, b: string, id: string, body: { action: "revise" | "acceptSubtotal"; version: number }) => request<{ quote: QuoteDto }>(one(w, b, id), json("POST", body)),
  remove: (w: string, b: string, id: string) => request<void>(one(w, b, id), { method: "DELETE" }),
  /** The invoice's `email` goes with both the preview and the confirm: the confirm token covers it. */
  preview: (w: string, b: string, id: string, action: QuoteShopifyAction, opts: { again?: boolean; email?: InvoiceEmailInput } = {}) =>
    request<QuotePreview>(`${one(w, b, id)}/shopify/preview`, json("POST", { action, ...opts })),
  confirm: (w: string, b: string, id: string, action: QuoteShopifyAction, confirmToken: string, email?: InvoiceEmailInput) =>
    request<{ quote: QuoteDto }>(`${one(w, b, id)}/shopify/confirm`, json("POST", { action, confirmToken, ...(action === "invoice" ? { email: email ?? {} } : {}) })),
};
