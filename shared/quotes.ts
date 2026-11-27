/**
 * Quotes (server/quotes/*): drafted in our app from catalogue products or free lines, created in Shopify as a draft
 * order, and sent with Shopify's own invoice email when a person confirms. Lines are a snapshot: title, variant and
 * unit price are frozen when added. Totals are worked out on the server only; shipping and tax are added by Shopify.
 */
export type QuoteStatus = "DRAFT" | "CREATED" | "SENT" | "ACCEPTED" | "EXPIRED" | "CANCELLED" | "DECLINED";

export const QUOTE_LIMITS = { lines: 100, quantity: 9999, title: 255, name: 200, email: 254, note: 2000, subject: 200, message: 2000, reason: 500, validDays: 30 } as const;

/** A money amount as the server writes it: digits with two decimals, "1250.00". */
export type Money = string;

/** One line as frozen on the quote. `variantId`: the Shopify variant of a catalogue product (null for a free line). */
export type QuoteLine = { productId: string | null; variantId: string | null; title: string; quantity: number; unitPrice: Money };
export type QuoteDiscount = { kind: "PERCENT" | "AMOUNT"; value: string };
/** `total` = subtotal − discount, before shipping and tax (what Shopify's draft-order subtotal is compared with). */
export type QuoteTotals = { subtotal: Money; discount: Money; total: Money };

/** A line as sent by a client: a catalogue product (its title and price are copied unless given), or a free line. */
export type QuoteLineInput =
  | { productId: string; quantity: number; title?: string; unitPrice?: string }
  | { productId?: null; title: string; quantity: number; unitPrice: string };

export type QuoteDto = {
  id: string;
  /** "Q-0042" */
  number: string;
  status: QuoteStatus;
  version: number;
  contactName: string | null;
  contactEmail: string | null;
  currency: string;
  lines: QuoteLine[];
  discount: QuoteDiscount | null;
  totals: QuoteTotals;
  note: string | null;
  internalNote: string | null;
  /** "YYYY-MM-DD" */
  /** "YYYY-MM-DD": 30 brand days from the invoice send; null until it is sent (a draft never expires) */
  validUntil: string | null;
  shopifyName: string | null;
  /** Shopify's draft order is behind this quote's edits: send an update before the invoice. */
  needsShopifyUpdate: boolean;
  /** Shopify's subtotal when it differs from `totals.total`; invoice send waits until a person accepts it. */
  shopifySubtotal: Money | null;
  subtotalDiffers: boolean;
  subtotalAccepted: boolean;
  invoiceUrl: string | null;
  sentAt: string | null;
  /** The customer record it belongs to (crm.manage), if linked. */
  customerId: string | null;
  /** DECLINED: why, as the team wrote it (≤ 500) */
  declinedReason: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

/** "Q-0042" */
export const quoteNumber = (n: number) => `Q-${String(n).padStart(4, "0")}`;

export type QuoteShopifyAction = "create" | "update" | "invoice";
/** DRAFT_ORDER_CREATE / DRAFT_ORDER_UPDATE: every field Shopify gets. No email: the customer hears nothing until invoice send. */
export type DraftOrderWritePreview = {
  /** Shopify's name of the draft ("#D12") on an update */
  draftOrder: string | null;
  currency: string;
  lines: { variantId: string | null; title: string; quantity: number; unitPrice: Money }[];
  discount: QuoteDiscount | null;
  note: string | null;
  /** "sma-quote-<id>" */
  tag: string;
  total: Money;
};
/** DRAFT_ORDER_INVOICE_SEND: Shopify emails its invoice to `to` with this subject and message. */
export type InvoiceWritePreview = { draftOrder: string; to: string; subject: string; message: string };
export type InvoiceEmailInput = { to?: string; subject?: string; message?: string };

/**
 * An earlier version of a quote (before an edit or a revise). `sent`: the customer had this one. Lines, discount, note
 * and totals come only when that one version is asked for.
 */
export type QuoteVersionDto = {
  version: number;
  sent: boolean;
  createdAt: string;
  createdById: string | null;
  lines?: QuoteLine[];
  discount?: QuoteDiscount | null;
  note?: string | null;
  totals?: QuoteTotals;
};
