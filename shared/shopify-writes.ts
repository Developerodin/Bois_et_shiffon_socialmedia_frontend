/**
 * Writes to Shopify that a person confirms (server/shopify/writes.ts): preview → confirm with the token → written at
 * most once. What a preview returns and the refusal codes clients switch on.
 */
export type ShopifyWriteAction =
  | "DRAFT_ORDER_CREATE"
  | "DRAFT_ORDER_UPDATE"
  | "DRAFT_ORDER_INVOICE_SEND"
  | "ARTICLE_CREATE"
  | "ARTICLE_UPDATE"
  | "ARTICLE_PUBLISH";
export type ShopifyWriteStatus = "PENDING" | "DONE" | "FAILED" | "UNKNOWN";

/** The Shopify access scope each write needs. */
export const SHOPIFY_WRITE_SCOPE: Record<ShopifyWriteAction, string> = {
  DRAFT_ORDER_CREATE: "write_draft_orders",
  DRAFT_ORDER_UPDATE: "write_draft_orders",
  DRAFT_ORDER_INVOICE_SEND: "write_draft_orders",
  ARTICLE_CREATE: "write_content",
  ARTICLE_UPDATE: "write_content",
  ARTICLE_PUBLISH: "write_content",
};

/** Whether the brand's Shopify writes can run now. NOT_CONNECTED: "Shopify writes aren't connected yet". */
export type ShopifyWritesReady =
  | { ready: true }
  | { ready: false; reason: "NOT_CONNECTED" }
  | { ready: false; reason: "MISSING_SCOPE"; scope: string };

export type ShopifyWritePreview<P> = {
  /** Exactly what will be written; confirming anything else is refused. */
  preview: P;
  attempt: number;
  confirmToken: string;
  expiresAt: string;
  writes: ShopifyWritesReady;
  /** The state of this attempt, if it was confirmed before. */
  last: ShopifyWriteStatus | null;
};

/** `code` on a refused confirm (problem response). */
export type ShopifyWriteCode =
  | "NOT_CONNECTED"
  | "MISSING_SCOPE"
  | "USER_ERROR"
  | "CHANGED"
  | "BAD_TOKEN"
  | "ALREADY_SENDING"
  | "ALREADY_DONE"
  | "NOT_CONFIRMED_YET"
  | "SEND_AGAIN"
  | "RATE_LIMITED";
