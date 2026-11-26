/** What a competitor audit says about the company's marketing. */
export type CompetitorApproach = {
  positioning: string;
  audience: string;
  products: string[];
  priceSignals: string;
  contentThemes: string[];
  strengths: string[];
  weaknesses: string[];
};

export type CompetitorScores = {
  performance: number | null;
  accessibility: number | null;
  bestPractices: number | null;
  seo: number | null;
  siteChecks: number | null;
  lcpMs: number | null;
};

/** The latest shared audit of a competitor's domain as the list shows it: the scores and how current they are. */
export type CompetitorAuditSummary = {
  id: string;
  domain: string;
  scores: CompetitorScores;
  createdAt: string;
  stale: boolean;
  /** The site blocked our crawler: PageSpeed scores and a search-based approach only, no page checks or findings. */
  partial: boolean;
};

/** The same audit in full, for the competitor's own view (GET competitors/:id/audit). */
export type CompetitorAudit = CompetitorAuditSummary & {
  url: string;
  findings: { id: string; severity: string; title: string; fix: string }[];
  aiCrawlers: { ua: string; purpose: string; allowed: boolean }[];
  /** A partial audit's approach may lack any field (search found nothing): read it through the web's readApproach. */
  approach: Partial<CompetitorApproach>;
  socials: { platform: string; url: string }[];
  sources: { url: string; title: string }[];
  pagesRead: number;
};

export type CompetitorDto = {
  id: string;
  name: string;
  domain: string;
  source: string;
  aiMentions: number | null;
  auditRunning: boolean;
  auditError: string | null;
  /** The latest audit failed because the site blocks automated readers; Audit is hidden until auditBlockedUntil (ISO). */
  auditBlocked: boolean;
  auditBlockedUntil: string | null;
  /** The latest failure was the site blocking us (ISO), even after the block lifted. */
  auditBlockedAt: string | null;
  audit: CompetitorAuditSummary | null;
};

/** `unlimited`: the workspace is never charged, so the balance doesn't limit audits. */
export type CompetitorCredits = { balance: number; auditCost: number; unlimited: boolean };

/** GET competitors. `credits` only for someone who may run audits (agents.run): a client reviewer doesn't see the balance. */
export type CompetitorsListDto = { credits?: CompetitorCredits; competitors: CompetitorDto[] };

/** Why Audit all didn't start a site. */
export type AuditAllSkip = "not-tracked" | "fresh" | "blocked" | "running" | "credits" | "limit" | "disabled" | "failed";

/** What the Audit all job did: the sites it started and the ones it skipped, with the balance after. */
export type AuditAllResult = { started: string[]; skipped: { id: string; reason: AuditAllSkip }[]; balance: number };

/**
 * POST competitors/audit-all answers at once: the sites queued for the background job, in order, and the ones it
 * already knows to skip (not tracked by this brand). The job decides the rest (fresh, blocked, running, credits).
 */
export type AuditAllQueued = { queued: string[]; skipped: { id: string; reason: AuditAllSkip }[] };
