import { dayDate } from "@/lib/time";

/** What a competitor audit says about the company's marketing. */
export type Approach = { positioning: string; audience: string; products: string[]; priceSignals: string; contentThemes: string[]; strengths: string[]; weaknesses: string[] };

/** Shown on a partial audit: the site refused our crawler, so only PageSpeed and search results fed it. */
export const PARTIAL_AUDIT_NOTE = "Page checks unavailable: this site blocks automated reading. Scores come from Google PageSpeed; the marketing summary from public search results.";

/** The neutral note that replaces "Last audit failed" while a blocking site can't be audited; `until` is when to try again. */
export function blockedAuditNote(domain: string, until: string | null) {
  const base = `${domain} blocks automated readers, so it can't be audited right now. Your credits were refunded.`;
  return until ? `${base} You can try again after ${dayDate(until)}.` : base;
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
