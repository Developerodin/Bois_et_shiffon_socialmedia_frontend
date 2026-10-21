import type { AuditKind, AuditReport, Prisma } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import type { Finding } from "@/server/seo/checks";

export async function saveAuditReport(input: {
  workspaceId: string;
  brandId: string;
  kind: AuditKind;
  score: number;
  summary: string;
  findings: Finding[];
  metrics: Prisma.InputJsonValue;
  agentRunId: string;
}) {
  return prisma.auditReport.create({
    data: { ...input, score: Math.round(Math.min(100, Math.max(0, input.score))), findings: input.findings as Prisma.InputJsonValue },
  });
}

/** Latest report per kind for one brand. */
export async function latestAuditReports(workspaceId: string, brandId: string) {
  const [seo, geo] = await Promise.all(
    (["SEO", "GEO"] as const).map((kind) =>
      prisma.auditReport.findFirst({ where: { workspaceId, brandId, kind }, orderBy: { createdAt: "desc" } }),
    ),
  );
  return { seo, geo };
}

export const toAuditDto = (r: AuditReport | null) =>
  r && {
    id: r.id,
    kind: r.kind,
    score: r.score,
    summary: r.summary,
    findings: r.findings,
    metrics: r.metrics,
    agentRunId: r.agentRunId,
    createdAt: r.createdAt.toISOString(),
  };
