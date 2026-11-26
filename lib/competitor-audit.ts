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

/** The list fields that decide a competitor row's status and whether Audit all picks it. */
export type AuditRowInput = AuditFailure & { aiMentions: number | null; auditRunning: boolean; audit: { stale: boolean; partial: boolean } | null };

/**
 * What a row shows where the scores go. Running wins (a new audit is on its way), then an active block (Audit is hidden
 * until it lifts, so say when), then the scores of the latest audit, with a note when page checks were unavailable or the
 * last try failed. Without an audit: the last failure if there was one, else "not audited yet".
 */
export type RowStatus =
  | { kind: "running"; text: string }
  | { kind: "blocked"; text: string }
  | { kind: "scores"; partial: boolean; stale: boolean; note: { text: string; soft: boolean } | null }
  | { kind: "failed"; text: string; soft: boolean }
  | { kind: "none"; text: string };

export function rowStatus(c: AuditRowInput): RowStatus {
  if (c.auditRunning) return { kind: "running", text: "auditing…" };
  if (c.auditBlocked) return { kind: "blocked", text: c.auditBlockedUntil ? `blocked · try after ${dayDate(c.auditBlockedUntil)}` : "blocked" };
  const note = lastFailureNote(c);
  if (c.audit) return { kind: "scores", partial: c.audit.partial, stale: c.audit.stale, note };
  if (note) return { kind: "failed", ...note };
  return { kind: "none", text: "not audited yet" };
}

/**
 * Audit all's plan. The candidates need an audit: never audited or stale (the server's freshness), not blocked, not
 * already running. The most named by AI go first, then never-audited before stale, then list order. The balance pays for
 * the first `affordable` of them; the rest wait for credits. The server starts them in this order and stops when credits
 * run out, so a concurrent spend only shortens the list.
 */
export function planAuditAll<T extends AuditRowInput & { id: string }>(competitors: T[], credits: { balance: number; auditCost: number }) {
  const candidates = competitors
    .map((c, i) => ({ c, i }))
    .filter(({ c }) => !c.auditRunning && !c.auditBlocked && (!c.audit || c.audit.stale))
    .sort((a, b) => (b.c.aiMentions ?? 0) - (a.c.aiMentions ?? 0) || Number(!!a.c.audit) - Number(!!b.c.audit) || a.i - b.i)
    .map(({ c }) => c);
  const k = credits.auditCost > 0 ? Math.min(candidates.length, Math.max(0, Math.floor(credits.balance / credits.auditCost))) : candidates.length;
  return { candidates, affordable: candidates.slice(0, k), waiting: candidates.slice(k), cost: credits.auditCost };
}

/** What the page says after Audit all: "Started 1 audit; 7 wait for credits." */
export function auditAllSummary(r: { started: string[]; skipped: { reason: string }[] }) {
  const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
  const credits = r.skipped.filter((s) => s.reason === "credits").length;
  const limit = r.skipped.filter((s) => s.reason === "limit").length;
  const other = r.skipped.length - credits - limit;
  const parts = [`Started ${n(r.started.length, "audit", "audits")}`];
  if (credits) parts.push(`${n(credits, "waits", "wait")} for credits`);
  if (limit) parts.push(`${n(limit, "waits", "wait")} for tomorrow (daily run limit)`);
  if (other) parts.push(`${n(other, "was", "were")} already running, fresh or unavailable`);
  return `${parts.join("; ")}.`;
}
