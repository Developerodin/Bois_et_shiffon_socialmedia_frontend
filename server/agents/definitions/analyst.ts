import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ANALYST_SYSTEM, CONTENT_PROMPT_VERSION } from "@/server/agents/prompts/content";
import type { AgentDefinition } from "@/server/agents/types";
import { prisma } from "@/server/db/prisma";

const Note = z.object({ title: z.string(), body: z.string(), tests: z.array(z.object({ idea: z.string(), measure: z.string() })) });

/**
 * Analyst: a learning note from the evidence we have. Until posts are published and their
 * metrics imported (publishing slice), that's site reports, the pipeline and quality patterns,
 * and the note says so instead of inventing numbers.
 */
export const analystAgent: AgentDefinition = {
  key: "analyst",
  name: "Analyst",
  description: "Writes learning notes from your results and reports, and suggests what to test next.",
  inputSchema: z.object({}).strict(),
  async run(ctx) {
    const { brand } = ctx;
    const where = { workspaceId: brand.workspaceId, brandId: brand.brandId };
    const [reports, byStatus, opps, checks, published] = await Promise.all([
      prisma.auditReport.findMany({ where, orderBy: { createdAt: "desc" }, take: 6, select: { kind: true, score: true, createdAt: true } }),
      prisma.contentItem.groupBy({ by: ["status"], where, _count: true }),
      prisma.opportunity.groupBy({ by: ["decision", "status"], where, _count: true }),
      prisma.qualityCheck.findMany({ where: { version: { item: where } }, orderBy: { createdAt: "desc" }, take: 40, select: { overall: true, results: true } }),
      prisma.contentItem.count({ where: { ...where, status: { in: ["PUBLISHED", "REVIEWED"] } } }),
    ]);
    const problemCounts = new Map<string, number>();
    for (const c of checks)
      for (const r of c.results as { check: string; status: string }[]) if (r.status !== "pass") problemCounts.set(r.check, (problemCounts.get(r.check) ?? 0) + 1);
    const evidence = {
      publishedPosts: published,
      siteReports: reports.map((r) => ({ kind: r.kind, score: r.score, at: r.createdAt.toISOString().slice(0, 10) })),
      pipeline: Object.fromEntries(byStatus.map((s) => [s.status, s._count])),
      opportunities: opps.map((o) => ({ decision: o.decision, status: o.status, count: o._count })),
      qualityChecks: { total: checks.length, blockers: checks.filter((c) => c.overall === "BLOCKER").length, commonIssues: [...problemCounts].sort((a, b) => b[1] - a[1]).slice(0, 5) },
    };
    await ctx.log("INFO", published ? `Reading results from ${published} published post(s)` : "No published posts yet: learning from reports, pipeline and quality checks");

    const out = await ctx.ai.generateObject({
      workflowId: "analyst.note",
      promptVersion: CONTENT_PROMPT_VERSION,
      schema: Note,
      schemaName: "learning_note",
      system: ANALYST_SYSTEM,
      prompt: `Brand: ${brand.displayName}\nToday: ${new Date().toISOString().slice(0, 10)}\nEvidence (JSON):\n${JSON.stringify(evidence)}`,
      mock: {
        title: "Pas encore de résultats publiés : priorités de départ",
        body: `Aucun post publié pour l'instant, donc pas de chiffres d'engagement. ${checks.length} brouillon(s) vérifié(s), ${evidence.qualityChecks.blockers} bloqué(s).`,
        tests: [{ idea: "Comparer carrousels conseils et Reels produits", measure: "Enregistrements et portée à 7 jours" }],
      },
    });
    const body = `${out.body}\n\n## À tester\n${out.tests.map((t) => `- ${t.idea} (mesure : ${t.measure})`).join("\n")}`;
    const note = await prisma.learningNote.create({
      data: { workspaceId: brand.workspaceId, brandId: brand.brandId, title: out.title, body, evidence: evidence as Prisma.InputJsonValue, agentRunId: ctx.runId },
    });
    await ctx.log("SUCCESS", `Learning note: ${out.title}`, { type: "LearningNote", id: note.id });
    return { noteId: note.id };
  },
};
