/**
 * CRM records (plan 2026-11-27-crm, Phase A): customers, companies, logged conversations, the follow-up queue and the
 * pipeline. The server is the source of truth for every derived field (follow-up state, overdue, lost suggestions).
 */

export const CRM_LIMITS = {
  name: 200,
  role: 100,
  language: 35,
  identity: 254,
  note: 4000,
  nextAction: 200,
  subject: 200,
  message: 4000,
  dealTitle: 200,
  closedNote: 500,
  website: 300,
  searchMin: 2,
  searchResults: 20,
  pageSize: 50,
  queuePage: 100,
} as const;

export type CustomerSource = "MANUAL" | "QUOTE" | "SHOPIFY" | "INBOX";
export type IdentityKind = "EMAIL" | "PHONE" | "INSTAGRAM" | "MESSENGER" | "SHOPIFY";
/** Kinds a person can add by hand (INSTAGRAM/MESSENGER/SHOPIFY come from the channels in Phases B and C). */
export const MANUAL_IDENTITY_KINDS = ["EMAIL", "PHONE"] as const satisfies readonly IdentityKind[];

/** A member of the workspace as the CRM shows them (owner pickers, authors). */
export type CrmPerson = { id: string; name: string | null };

export type CompanyDto = { id: string; name: string; website: string | null; ownerId: string | null; customers: number; createdAt: string; updatedAt: string };

export type IdentityDto = { id: string; kind: IdentityKind; value: string };

export type CustomerNoteDto = { id: string; authorId: string | null; text: string; createdAt: string; mine: boolean; deletable: boolean };

/** A customer in a list or search result. */
export type CustomerRow = {
  id: string;
  displayName: string;
  role: string | null;
  company: { id: string; name: string } | null;
  ownerId: string | null;
  nextAction: string | null;
  /** "YYYY-MM-DD" */
  nextActionDue: string | null;
  lastActivityAt: string;
};

/** One customer's page. `conversations` only for inbox.read holders (null otherwise). */
export type CustomerDto = CustomerRow & {
  language: string | null;
  source: CustomerSource;
  identities: IdentityDto[];
  notes: CustomerNoteDto[];
  quotes: { id: string; number: string; status: string; total: string; currency: string; updatedAt: string }[];
  deals: { id: string; title: string; stage: DealStage; value: string | null; currency: string | null }[];
  conversations: ConversationRow[] | null;
  createdAt: string;
  updatedAt: string;
};

export type ConversationChannel = "LOGGED" | "INSTAGRAM" | "MESSENGER";
export type MessageMedium = "EMAIL" | "PHONE" | "IN_PERSON" | "WHATSAPP" | "OTHER";
export const MESSAGE_MEDIA = ["EMAIL", "PHONE", "IN_PERSON", "WHATSAPP", "OTHER"] as const satisfies readonly MessageMedium[];

/**
 * Derived, never stored (Decision 5). NEEDS_REPLY: the customer wrote last. WAITING: we wrote last or a person marked
 * it. `overdue`: needs a reply for over 24 h, waiting for over 7 days, or the next action's day has passed.
 */
export type FollowUpState = "NEEDS_REPLY" | "WAITING" | "CLOSED";

export type ConversationRow = {
  id: string;
  channel: ConversationChannel;
  subject: string | null;
  customer: { id: string; displayName: string } | null;
  ownerId: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  lastMessageAt: string;
  lastFromCustomer: boolean;
  waitingSince: string | null;
  closedAt: string | null;
  state: FollowUpState;
  overdue: boolean;
};

export type ConversationMessageDto = { id: string; medium: MessageMedium | null; fromCustomer: boolean; text: string; sentAt: string; loggedById: string | null };

export type ConversationDto = ConversationRow & { messages: ConversationMessageDto[]; summary: string | null; summaryThrough: string | null; summaryStale: boolean };

export type FollowUpFilter = "open" | "mine" | "needsReply" | "overdue" | "waiting" | "closed";
export type FollowUpCounts = { needsReply: number; overdue: number; waiting: number; mine: number };

/** O2 (owner, 2026-11-27). */
export type DealStage = "NEW" | "CONTACTED" | "PROPOSAL" | "NEGOTIATION" | "WON" | "LOST";
export const DEAL_STAGES = ["NEW", "CONTACTED", "PROPOSAL", "NEGOTIATION", "WON", "LOST"] as const satisfies readonly DealStage[];
export const OPEN_DEAL_STAGES = ["NEW", "CONTACTED", "PROPOSAL", "NEGOTIATION"] as const satisfies readonly DealStage[];
export const DEAL_STAGE_LABEL: Record<DealStage, string> = { NEW: "New", CONTACTED: "Contacted", PROPOSAL: "Proposal", NEGOTIATION: "Negotiation", WON: "Won", LOST: "Lost" };
/** Why a deal was won or lost (with optional text). `quote_accepted` is set by a quote's acceptance. */
export const DEAL_CLOSE_REASONS = ["quote_accepted", "price", "timing", "competitor", "no_response", "not_a_fit", "other"] as const;
export type DealCloseReason = (typeof DEAL_CLOSE_REASONS)[number];
export const DEAL_CLOSE_REASON_LABEL: Record<DealCloseReason, string> = {
  quote_accepted: "Quote accepted",
  price: "Price",
  timing: "Timing",
  competitor: "Went elsewhere",
  no_response: "No response",
  not_a_fit: "Not a fit",
  other: "Other",
};

export type DealDto = {
  id: string;
  title: string;
  stage: DealStage;
  customer: { id: string; displayName: string } | null;
  company: { id: string; name: string } | null;
  /** inbox.read holders only (null otherwise) */
  conversationId: string | null;
  /** "1250.00" */
  value: string | null;
  currency: string | null;
  ownerId: string | null;
  nextAction: string | null;
  nextActionDue: string | null;
  closedReason: DealCloseReason | null;
  closedNote: string | null;
  stageChangedAt: string;
  closedAt: string | null;
  /** Its quotes ended without acceptance and none is open: a person may mark it lost (never moved automatically). */
  lostSuggested: boolean;
  /** Lost here, but one of its quotes was accepted (paid late): worth a look. */
  lostButPaid: boolean;
  quotes: { id: string; number: string; status: string }[];
  createdAt: string;
  updatedAt: string;
};

/** Per stage, the deals shown and each currency's total (never summed across currencies). */
export type PipelineDto = { columns: { stage: DealStage; deals: DealDto[]; totals: { currency: string; value: string }[]; more: boolean }[] };
