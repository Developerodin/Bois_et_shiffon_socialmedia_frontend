import { z } from "zod";
import { PROMPT_VERSION, SEO_SYSTEM } from "@/server/agents/prompts/seo-geo";
import type { AgentDefinition } from "@/server/agents/types";
import { applyPriorities, scoreFindings, seoChecks } from "@/server/seo/checks";
import { collectSiteFacts, pageSpeedFindings, runPageSpeed } from "@/server/seo/site-facts";
import { saveAuditReport } from "@/server/services/audit-reports";

export const Prioritised = z.object({
  summary: z.string().min(1),
  priorities: z.array(z.object({ findingId: z.string(), why: z.string() })),
});

/**
 * SEO agent (Okara "SEO fixes"): technical + on-page audit of the brand's site.
 * Findings and score are deterministic (server/seo/checks.ts); the AI only explains and orders them.
 * ponytail: samples up to 8 pages (crawler cap); raise MAX_PAGES or read the sitemap for full-site audits.
 */
export const seoAgent: AgentDefinition = {
  key: "seo",
  name: "SEO",
  description: "Audits the website's technical and on-page SEO and lists the fixes that matter most.",
  inputSchema: z.object({}).strict(),
  async run(ctx) {
    const { brand } = ctx;
    if (!brand.websiteUrl) throw new Error("Brand has no website URL — add one in Context settings");

    await ctx.log("INFO", `Auditing ${brand.websiteUrl}`);
    const { facts, failures } = await collectSiteFacts(brand.websiteUrl, (url, title) =>
      ctx.log("INFO", `Checked ${title ?? url}`, undefined, { url }),
    );
    for (const f of failures.slice(0, 5)) await ctx.log("WARN", `Skipped ${f.url}: ${f.error}`);
    if (facts.pages.length === 0) throw new Error("Could not read any page from the website");

    await ctx.log("INFO", "Running PageSpeed Insights (mobile)");
    const ps = await runPageSpeed(facts.pages[0].url);
    if (ps.error) await ctx.log("WARN", `PageSpeed unavailable: ${ps.error}`);

    const findings = [...seoChecks(facts), ...(ps.result ? pageSpeedFindings(ps.result) : [])];
    const checksScore = scoreFindings(findings);
    const score = ps.result
      ? Math.round(0.7 * checksScore + 0.3 * ((ps.result.performance + ps.result.seo) / 2))
      : checksScore;
    await ctx.log("INFO", `${findings.length} issue(s) found, score ${score}/100 — prioritising`);

    const ai = await ctx.ai.generateObject({
      workflowId: "seo.prioritise",
      promptVersion: PROMPT_VERSION,
      schema: Prioritised,
      schemaName: "seo_priorities",
      system: SEO_SYSTEM,
      prompt: JSON.stringify({
        brand: brand.displayName,
        website: brand.websiteUrl,
        score,
        pageSpeed: ps.result,
        findings,
        pages: facts.pages.map((p) => ({ url: p.url, title: p.title, words: p.seo?.wordCount, schema: p.seo?.jsonLdTypes })),
      }),
      mock: {
        summary: `${findings.length} SEO issue(s) found on ${facts.pages.length} page(s). Drafted without a real AI provider.`,
        priorities: findings.map((f) => ({ findingId: f.id, why: f.detail })),
      },
    });

    const report = await saveAuditReport({
      workspaceId: brand.workspaceId,
      brandId: brand.brandId,
      kind: "SEO",
      score,
      summary: ai.summary,
      findings: applyPriorities(findings, ai.priorities),
      metrics: {
        pagesChecked: facts.pages.map((p) => p.url),
        pageSpeed: ps.result,
        pageSpeedError: ps.error ?? null,
        checksScore,
        hasSitemap: facts.hasSitemap,
        hasRobotsTxt: facts.robotsTxt !== null,
      },
      agentRunId: ctx.runId,
    });
    await ctx.log("SUCCESS", `SEO report ready — ${score}/100, ${findings.length} fix(es)`, { type: "AuditReport", id: report.id });
    return { score, findings: findings.length, pages: facts.pages.length };
  },
};
