import { readable } from "@/lib/agent-message";
import { dayDate } from "@/lib/time";

/** What a competitor audit says about the company's marketing. */
export type Approach = { positioning: string; audience: string; products: string[]; priceSignals: string; contentThemes: string[]; strengths: string[]; weaknesses: string[] };

/** Shown on a partial audit: the site refused our crawler, so only PageSpeed and search results fed it. */
export const PARTIAL_AUDIT_NOTE =
  "Page checks unavailable: this site blocks automated readers. This audit has only Google PageSpeed scores and a marketing summary from public search results.";

/** The competitor fields that describe its latest failed audit (from the competitors list). */
export type AuditFailure = { domain: string; auditError: string | null; auditBlocked: boolean; auditBlockedUntil: string | null; auditBlockedAt: string | null };

/**
 * What to say about the latest failed audit, if anything. `soft` notes are neutral: while a blocking site can't be
 * audited (Audit is hidden, so say when to try again), and once that block has lifted (Audit is back, so a red "can't be
 * audited" would contradict it). Any other failure is the error itself, in red.
 */
export function lastFailureNote(c: AuditFailure): { text: string; soft: boolean } | null {
  if (!c.auditError) return null;
  if (c.auditBlocked) {
    const base = `${c.domain} blocks automated readers, so it can't be audited right now. Your credits were refunded.`;
    return { text: c.auditBlockedUntil ? `${base} You can try again after ${dayDate(c.auditBlockedUntil)}.` : base, soft: true };
  }
  if (c.auditBlockedAt) return { text: `Last tried ${dayDate(c.auditBlockedAt)}: the site blocked automated readers. You can try again.`, soft: true };
  return { text: `Last audit failed: ${readable(c.auditError)}`, soft: false };
}

/**
 * A partial audit keeps only the fields search found, or none when search cited nothing, so its approach can lack
 * any of them. Fill the gaps with empty values so the page renders "-" instead of crashing on a missing list.
 */
export function readApproach(raw: Partial<Approach> | null | undefined): Approach {
  const text = (v: unknown) => (typeof v === "string" ? v : "");
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    positioning: text(raw?.positioning),
    audience: text(raw?.audience),
    products: list(raw?.products),
    priceSignals: text(raw?.priceSignals),
    contentThemes: list(raw?.contentThemes),
    strengths: list(raw?.strengths),
    weaknesses: list(raw?.weaknesses),
  };
}
