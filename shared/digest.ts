import type { DateRange, SearchMetrics } from "./data-sources";
import type { PermissionKey } from "./permissions";

/**
 * The weekly digest (server/digest/build.ts): per brand, the sections the reader's permissions showed when it was
 * built. Each section names the key that allowed it, so a read drops it once that key is gone. Numbers, titles of the
 * reader's own visible tasks and posts, and brand names only: never customer names or message text.
 * A section whose source never synced has `data: null` ("No data yet", never 0).
 */
export type DigestSection =
  | { kind: "content"; key: "brand.read"; published: number; scheduled: number; awaitingApproval: number }
  /**
   * `crm`: CRM-area tasks were counted (the reader held inbox.read or crm.manage), so it needs one of them still.
   * Counts are as built; `overdueTasks` (first 5) are re-checked against task visibility on every read and send.
   */
  | { kind: "tasks"; key: "tasks.read"; crm: boolean; done: number; open: number; overdue: number; overdueTasks: { id: string; title: string }[] }
  /** The latest 7 complete Search Console days (Google lags 2-3 days), in Google's Pacific days. */
  | { kind: "seo"; key: "analytics.read"; data: { range: DateRange; totals: SearchMetrics; previous: SearchMetrics } | null }
  /** The week's published posts with the most reach (reach null until read). */
  | { kind: "posts"; key: "analytics.read"; published: number; top: { title: string | null; channel: string; reach: number | null }[] }
  /** Per currency, never added across currencies. */
  | { kind: "sales"; key: "crm.read"; data: { currency: string; orders: number; netSales: string }[] | null }
  | { kind: "ads"; key: "ads.read"; data: { currency: string; spend: string; purchases: number; purchaseValue: string; roas: number | null }[] | null };

export type DigestSectionKind = DigestSection["kind"];
/** The key each section needs (the `key` it carries). */
export const DIGEST_SECTION_KEY = {
  content: "brand.read",
  tasks: "tasks.read",
  seo: "analytics.read",
  posts: "analytics.read",
  sales: "crm.read",
  ads: "ads.read",
} as const satisfies Record<DigestSectionKind, PermissionKey>;

/** One brand: its own ended Monday–Sunday in its time zone. */
export type DigestBrand = { brandId: string; brandName: string; week: DateRange; sections: DigestSection[] };
export type DigestBody = { brands: DigestBrand[] };

/** GET workspaces/:w/digests: the reader's latest digests (8), re-filtered by their current permissions. */
export type DigestDto = { id: string; weekStart: string; createdAt: string; body: DigestBody };
export type DigestsDto = { digests: DigestDto[]; email: boolean };
/** PUT me/digest-email */
export type DigestEmailBody = { email: boolean };
