import { startAgentRun } from "@/server/agents/engine";
import { prisma } from "@/server/db/prisma";
import { AUDIT_FRESH_DAYS, creditBalance, CREDIT_COSTS, InsufficientCreditsError, refundCharge, spendCredits } from "@/server/services/credits";

/** Public fields of a shared audit: never who requested it. */
const PUBLIC_AUDIT = {
  id: true,
  domain: true,
  url: true,
  scores: true,
  findings: true,
  aiCrawlers: true,
  approach: true,
  socials: true,
  sources: true,
  pagesRead: true,
  createdAt: true,
} as const;

/** This brand's competitors, each with the latest shared audit of its domain (from any customer). */
export async function listCompetitors(workspaceId: string, brandId: string) {
  const competitors = await prisma.competitor.findMany({ where: { workspaceId, brandId }, orderBy: { createdAt: "asc" } });
  const domains = competitors.map((c) => c.domain);
  const [audits, running, failed, geo, balance] = await Promise.all([
    prisma.siteAudit.findMany({ where: { domain: { in: domains } }, orderBy: { createdAt: "desc" }, distinct: ["domain"], select: PUBLIC_AUDIT }),
    // Any workspace's running audit counts (shared library), but only for this brand's domains.
    domains.length
      ? prisma.agentRun.findMany({
          where: { agentKey: "site-audit", status: { in: ["QUEUED", "RUNNING"] }, OR: domains.map((d) => ({ input: { path: ["domain"], equals: d } })) },
          select: { input: true },
        })
      : [],
    // This workspace's own failed audits only: another customer's error text is theirs.
    // ponytail: newest 50 failures cover a brand's competitor list; past that, query per domain.
    domains.length
      ? prisma.agentRun.findMany({
          where: { workspaceId, agentKey: "site-audit", status: "FAILED", OR: domains.map((d) => ({ input: { path: ["domain"], equals: d } })) },
          orderBy: { createdAt: "desc" },
          take: 50,
          select: { input: true, error: true, createdAt: true, finishedAt: true },
        })
      : [],
    prisma.auditReport.findFirst({ where: { workspaceId, brandId, kind: "GEO" }, orderBy: { createdAt: "desc" }, select: { metrics: true } }),
    creditBalance(workspaceId),
  ]);
  const runningDomains = new Set(running.map((r) => (r.input as { domain?: string } | null)?.domain));
  const mentions = new Map(((geo?.metrics as { competitors?: { name: string; mentions: number }[] } | null)?.competitors ?? []).map((c) => [c.name.toLowerCase(), c.mentions]));
  const staleBefore = Date.now() - AUDIT_FRESH_DAYS * 86_400_000;
  return {
    credits: { balance, auditCost: CREDIT_COSTS.siteAudit },
    competitors: competitors.map((c) => {
      const audit = audits.find((a) => a.domain === c.domain) ?? null;
      // The latest failure, unless a successful audit landed after it.
      const fail = failed.find((r) => (r.input as { domain?: string } | null)?.domain === c.domain);
      const failedAt = fail && (fail.finishedAt ?? fail.createdAt);
      return {
        id: c.id,
        name: c.name,
        domain: c.domain,
        source: c.source,
        aiMentions: mentions.get(c.name.toLowerCase()) ?? null,
        auditRunning: runningDomains.has(c.domain),
        auditError: failedAt && (!audit || failedAt > audit.createdAt) ? (fail?.error ?? "The audit failed.") : null,
        audit: audit && { ...audit, createdAt: audit.createdAt.toISOString(), stale: audit.createdAt.getTime() < staleBefore },
      };
    }),
  };
}

export type StartAuditResult =
  | { status: "started"; charged: number }
  | { status: "already-running" }
  | { status: "insufficient-credits"; balance: number; needed: number };

/**
 * Fresh audit of a competitor's domain, paid by this workspace. If any customer's audit of the same
 * domain is already running, nobody is charged twice: the result lands in the shared library for all.
 * Charge first (atomic, locked), start the run with the charge id, refund if the start fails;
 * the engine refunds too if the run finally fails (onAgentRunFailure).
 */
export async function startCompetitorAudit(input: { workspaceId: string; brandId: string; userId: string; competitorId: string }): Promise<StartAuditResult> {
  const competitor = await prisma.competitor.findFirstOrThrow({ where: { id: input.competitorId, workspaceId: input.workspaceId, brandId: input.brandId } });
  const running = await prisma.agentRun.findFirst({
    where: { agentKey: "site-audit", status: { in: ["QUEUED", "RUNNING"] }, input: { path: ["domain"], equals: competitor.domain } },
    select: { id: true },
  });
  if (running) return { status: "already-running" };

  let chargeId: string;
  try {
    chargeId = await spendCredits({ workspaceId: input.workspaceId, amount: CREDIT_COSTS.siteAudit, reason: "site-audit", userId: input.userId });
  } catch (e) {
    if (e instanceof InsufficientCreditsError) return { status: "insufficient-credits", balance: e.balance, needed: e.needed };
    throw e;
  }
  try {
    const run = await startAgentRun({
      workspaceId: input.workspaceId,
      brandId: input.brandId,
      agentKey: "site-audit",
      trigger: "manual",
      userId: input.userId,
      input: { domain: competitor.domain },
      prepaidChargeId: chargeId,
    });
    // A second click while the first is queued joins that run; give this charge back.
    if ((run.input as { chargeId?: string } | null)?.chargeId !== chargeId) {
      await refundCharge(input.workspaceId, chargeId);
      return { status: "already-running" };
    }
  } catch (e) {
    await refundCharge(input.workspaceId, chargeId);
    throw e;
  }
  return { status: "started", charged: CREDIT_COSTS.siteAudit };
}
