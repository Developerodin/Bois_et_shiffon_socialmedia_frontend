// Client-side contract for the quotes and CRM APIs (app/api/v1/.../brands/[brandId]/{quotes,crm}). Keep in sync with the routes.
import { ApiError, request } from "@/components/settings/api";
import type { CompanyDto, ConversationDto, ConversationRow, CustomerDto, CustomerNoteDto, CustomerRow, DealCloseReason, DealDto, DealStage, DraftOrderWritePreview, FollowUpCounts, FollowUpFilter, MessageMedium, PipelineDto, InvoiceEmailInput, InvoiceWritePreview, QuoteDiscount, QuoteDto, QuoteLineInput, QuoteShopifyAction, QuoteVersionDto, ShopifyWritePreview } from "@/shared";

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

const brand = (w: string, b: string) => `/api/v1/workspaces/${encodeURIComponent(w)}/brands/${encodeURIComponent(b)}`;
const base = (w: string, b: string) => `/api/v1/workspaces/${encodeURIComponent(w)}/brands/${encodeURIComponent(b)}/quotes`;
const one = (w: string, b: string, id: string) => `${base(w, b)}/${encodeURIComponent(id)}`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const quotesApi = {
  list: (w: string, b: string) => request<{ quotes: QuoteDto[] }>(base(w, b)),
  get: (w: string, b: string, id: string) => request<{ quote: QuoteDto }>(one(w, b, id)),
  create: (w: string, b: string, body: QuoteBody) => request<{ quote: QuoteDto }>(base(w, b), json("POST", body)),
  update: (w: string, b: string, id: string, body: QuoteBody & { version: number }) => request<{ quote: QuoteDto }>(one(w, b, id), json("PATCH", body)),
  /** revise: a sent quote back to editable; acceptSubtotal: go with Shopify's subtotal where it differs; markSent / markAccepted: by hand, for a quote not in Shopify; decline: the customer said no. */
  act: (w: string, b: string, id: string, body: { action: "revise" | "acceptSubtotal" | "markSent" | "markAccepted"; version: number } | { action: "decline"; version: number; reason?: string | null }) => request<{ quote: QuoteDto }>(one(w, b, id), json("POST", body)),
  /** A draft never in Shopify is deleted (nothing back); any other open quote is cancelled: the quote, and a notice when its invoice stays payable. */
  remove: (w: string, b: string, id: string) => request<{ quote: QuoteDto; notice: string | null } | undefined>(one(w, b, id), { method: "DELETE" }),
  /** Earlier versions, newest first; with `version`, that one with its lines and totals. */
  versions: (w: string, b: string, id: string, version?: number) =>
    request<{ versions: QuoteVersionDto[] }>(`${one(w, b, id)}/versions${version ? `?version=${version}` : ""}`),
  /** The invoice's `email` goes with both the preview and the confirm: the confirm token covers it. */
  preview: (w: string, b: string, id: string, action: QuoteShopifyAction, opts: { again?: boolean; email?: InvoiceEmailInput } = {}) =>
    request<QuotePreview>(`${one(w, b, id)}/shopify/preview`, json("POST", { action, ...opts })),
  confirm: (w: string, b: string, id: string, action: QuoteShopifyAction, confirmToken: string, email?: InvoiceEmailInput) =>
    request<{ quote: QuoteDto }>(`${one(w, b, id)}/shopify/confirm`, json("POST", { action, confirmToken, ...(action === "invoice" ? { email: email ?? {} } : {}) })),
};

/** The fields a person edits on a customer (create and PATCH); the PATCH adds the `updatedAt` it read. */
export type CustomerFields = {
  displayName?: string;
  role?: string | null;
  language?: string | null;
  companyId?: string | null;
  ownerId?: string | null;
  nextAction?: string | null;
  /** "YYYY-MM-DD" */
  nextActionDue?: string | null;
};
export type ManualIdentity = { kind: "EMAIL" | "PHONE"; value: string };

const crm = (w: string, b: string) => `${brand(w, b)}/crm`;
const conversation = (w: string, b: string, id: string) => `${crm(w, b)}/conversations/${encodeURIComponent(id)}`;

export type ConversationSummary = { summary: string; nextStep: string | null; /** "YYYY-MM-DD" */ nextActionDue: string | null; cached: boolean };
export type LoggedMessage = { fromCustomer: boolean; medium: MessageMedium; text: string; /** ISO with offset */ sentAt: string };
export type ConversationPatch = {
  updatedAt: string;
  subject?: string | null;
  ownerId?: string | null;
  nextAction?: string | null;
  nextActionDue?: string | null;
  /** true: waiting on the customer from now; false: back to needing our reply */
  waiting?: boolean;
  /** true: close; false: reopen */
  closed?: boolean;
  customerId?: string | null;
};
export type DealFields = {
  title?: string;
  customerId?: string | null;
  companyId?: string | null;
  conversationId?: string | null;
  /** "1250.50" */
  value?: string | null;
  currency?: string | null;
  ownerId?: string | null;
  nextAction?: string | null;
  nextActionDue?: string | null;
};
const customer = (w: string, b: string, id: string) => `${crm(w, b)}/customers/${encodeURIComponent(id)}`;

/** CRM records (crm.manage on every route). Errors carry `code`; an identity clash is `crm.identityTaken` (identityConflict). */
export const crmApi = {
  /** 50 a page, latest activity first. */
  customers: (w: string, b: string, cursor?: string | null, init?: RequestInit) =>
    request<{ customers: CustomerRow[]; nextCursor: string | null }>(`${crm(w, b)}/customers${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`, init),
  /** At least CRM_LIMITS.searchMin characters (searchTerm); 20 results; 429 past 60 a minute. */
  search: (w: string, b: string, q: string, init?: RequestInit) =>
    request<{ customers: CustomerRow[]; nextCursor: null }>(`${crm(w, b)}/customers?q=${encodeURIComponent(q)}`, init),
  customer: (w: string, b: string, id: string) => request<{ customer: CustomerDto }>(customer(w, b, id)),
  createCustomer: (w: string, b: string, body: CustomerFields & { displayName: string; identities?: ManualIdentity[] }) =>
    request<{ customer: CustomerDto }>(`${crm(w, b)}/customers`, json("POST", body)),
  /** 409 `crm.changed` when someone saved since `updatedAt` was read. */
  updateCustomer: (w: string, b: string, id: string, body: CustomerFields & { updatedAt: string }) => request<{ customer: CustomerDto }>(customer(w, b, id), json("PATCH", body)),
  addIdentity: (w: string, b: string, id: string, body: ManualIdentity) => request<{ customer: CustomerDto }>(`${customer(w, b, id)}/identities`, json("POST", body)),
  removeIdentity: (w: string, b: string, id: string, identityId: string) =>
    request<{ customer: CustomerDto }>(`${customer(w, b, id)}/identities/${encodeURIComponent(identityId)}`, { method: "DELETE" }),
  addNote: (w: string, b: string, id: string, text: string) => request<{ note: CustomerNoteDto }>(`${customer(w, b, id)}/notes`, json("POST", { text })),
  /** Only the author's own note, in its first 24 hours (`deletable`). */
  deleteNote: (w: string, b: string, id: string, noteId: string) => request<void>(`${customer(w, b, id)}/notes/${encodeURIComponent(noteId)}`, { method: "DELETE" }),
  companies: (w: string, b: string) => request<{ companies: CompanyDto[] }>(`${crm(w, b)}/companies`),
  createCompany: (w: string, b: string, body: { name: string; website?: string | null; ownerId?: string | null }) =>
    request<{ company: CompanyDto }>(`${crm(w, b)}/companies`, json("POST", body)),
  company: (w: string, b: string, id: string) => request<{ company: CompanyDto }>(`${crm(w, b)}/companies/${encodeURIComponent(id)}`),
  /** 409 `crm.changed` when someone saved since `updatedAt` was read. */
  updateCompany: (w: string, b: string, id: string, body: { name?: string; website?: string | null; ownerId?: string | null; updatedAt: string }) =>
    request<{ company: CompanyDto }>(`${crm(w, b)}/companies/${encodeURIComponent(id)}`, json("PATCH", body)),
  /** Link a quote to a customer (null unlinks), or `{ create: true }`: save its contact as a new customer. */
  quoteCustomer: (w: string, b: string, quoteId: string, body: { customerId: string | null } | { create: true }) =>
    request<{ quote: QuoteDto }>(`${one(w, b, quoteId)}/customer`, json("POST", body)),
  /** Same-name customers to merge into this one. */
  mergeSuggestions: (w: string, b: string, id: string) => request<{ suggestions: CustomerRow[] }>(`${customer(w, b, id)}/merge`),
  /** Moves `otherId`'s details, notes, conversations, deals and quotes to this customer and deletes it; both as read (409). */
  merge: (w: string, b: string, id: string, body: { otherId: string; survivorUpdatedAt: string; otherUpdatedAt: string }) =>
    request<{ customer: CustomerDto }>(`${customer(w, b, id)}/merge`, json("POST", body)),
  /** Erase and export also need a workspace role holding members.manage (403 otherwise). */
  eraseCustomer: (w: string, b: string, id: string) => request<void>(`${customer(w, b, id)}/erase`, { method: "POST" }),
  exportUrl: (w: string, b: string, id: string) => `${customer(w, b, id)}/export`,
  eraseCompany: (w: string, b: string, id: string) => request<void>(`${crm(w, b)}/companies/${encodeURIComponent(id)}/erase`, { method: "POST" }),

  /** The follow-up queue (inbox.read), 100 a page. */
  followUps: (w: string, b: string, filter: FollowUpFilter, cursor?: string | null) =>
    request<{ conversations: ConversationRow[]; nextCursor: string | null }>(`${crm(w, b)}/follow-ups?${new URLSearchParams({ filter, ...(cursor ? { cursor } : {}) }).toString()}`),
  followUpCounts: (w: string, b: string) => request<{ counts: FollowUpCounts }>(`${crm(w, b)}/follow-ups/counts`),
  conversation: (w: string, b: string, id: string) => request<{ conversation: ConversationDto }>(conversation(w, b, id)),
  /** Logs a message that happened elsewhere: nothing is sent. 400 `crm.messageDate` for a future or too old `sentAt`. */
  logMessage: (w: string, b: string, id: string, body: LoggedMessage) => request<{ conversation: ConversationDto }>(`${conversation(w, b, id)}/messages`, json("POST", body)),
  /** 409 `crm.changed` when stale; `customerId` needs crm.manage; an owner must hold inbox.read (400 `crm.owner`). */
  updateConversation: (w: string, b: string, id: string, body: ConversationPatch) => request<{ conversation: ConversationDto }>(conversation(w, b, id), json("PATCH", body)),
  /** The AI summary and a suggested next step (never applied by itself); `cached`: the saved one, with no next step. */
  summarise: (w: string, b: string, id: string) => request<{ summary: ConversationSummary }>(`${conversation(w, b, id)}/summary`, { method: "POST" }),
  /** An AI reply draft to copy (inbox.read and content.create); nothing is sent. */
  draftReply: (w: string, b: string, id: string) => request<{ draft: string }>(`${conversation(w, b, id)}/draft`, { method: "POST" }),
  /** A new logged conversation on a customer: inbox.read and crm.manage. */
  createConversation: (w: string, b: string, body: { customerId: string; subject?: string | null; ownerId?: string | null; message: LoggedMessage }) =>
    request<{ conversation: ConversationDto }>(`${crm(w, b)}/conversations`, json("POST", body)),

  pipeline: (w: string, b: string) => request<{ pipeline: PipelineDto }>(`${crm(w, b)}/deals`),
  deal: (w: string, b: string, id: string) => request<{ deal: DealDto }>(`${crm(w, b)}/deals/${encodeURIComponent(id)}`),
  /** 400 `crm.currency` for a value without a currency. */
  createDeal: (w: string, b: string, body: DealFields & { title: string; stage?: DealStage }) => request<{ deal: DealDto }>(`${crm(w, b)}/deals`, json("POST", body)),
  /** Moving to WON or LOST needs `closedReason` (400 `crm.closeReason`); 409 `crm.changed` when stale. */
  updateDeal: (w: string, b: string, id: string, body: DealFields & { updatedAt: string; stage?: DealStage; closedReason?: DealCloseReason | null; closedNote?: string | null }) =>
    request<{ deal: DealDto }>(`${crm(w, b)}/deals/${encodeURIComponent(id)}`, json("PATCH", body)),
  /** Link a quote to a deal (null unlinks); an already-sent or accepted quote moves the deal forward. */
  quoteDeal: (w: string, b: string, quoteId: string, dealId: string | null) => request<{ quote: QuoteDto }>(`${one(w, b, quoteId)}/deal`, json("POST", { dealId })),
};

/** A 409 `crm.identityTaken`: its message, and the customer who has the detail when the server names them. */
export function identityConflict(e: unknown): { message: string; customerId: string | null; customerName: string | null } | null {
  if (!(e instanceof ApiError) || e.code !== "crm.identityTaken") return null;
  const d = (e.data ?? {}) as { customerId?: unknown; customerName?: unknown };
  return {
    message: e.message,
    customerId: typeof d.customerId === "string" ? d.customerId : null,
    customerName: typeof d.customerName === "string" ? d.customerName : null,
  };
}
