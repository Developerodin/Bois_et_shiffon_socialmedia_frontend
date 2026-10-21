import { z } from "zod";
import { Prioritised } from "@/server/agents/definitions/seo";
import {
  GEO_ANSWER_SYSTEM,
  GEO_CITABILITY_SYSTEM,
  GEO_QUESTIONS_SYSTEM,
  GEO_SUMMARY_SYSTEM,
  PROMPT_VERSION,
} from "@/server/agents/prompts/seo-geo";
import type { AgentDefinition } from "@/server/agents/types";
import { aiCrawlerAccess, applyPriorities, geoTechnicalChecks, scoreFindings, type Finding } from "@/server/seo/checks";
import { collectSiteFacts } from "@/server/seo/site-facts";
import { saveAuditReport } from "@/server/services/audit-reports";
import { confirmedContext } from "@/server/services/context-docs";

const QUESTION_COUNT = 5; // ponytail: 5 web-search answers per run caps cost; raise for a wider panel

const Citability = z.object({
  pages: z.array(
    z.object({ url: z.string(), citability: z.number(), structure: z.number(), authority: z.number() }),
  ),
  findings: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
      fix: z.string(),
      severity: z.enum(["high", "medium", "low"]),
      urls: z.array(z.string()),
    }),
  ),
});
const Questions = z.object({ questions: z.array(z.string()) });
const Answer = z.object({ answer: z.string(), brandsMentioned: z.array(z.string()), sources: z.array(z.string()) });

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Brand counts as mentioned when an answer names it or cites its domain. */
export function mentionsBrand(a: z.infer<typeof Answer>, brandName: string, domain: string) {
  const name = brandName.toLowerCase();
  return (
    a.brandsMentioned.some((b) => {
      const n = b.trim().toLowerCase();
      return n.length > 2 && (n.includes(name) || name.includes(n));
    }) ||
    a.sources.some((s) => s.toLowerCase().includes(domain)) ||
    a.answer.toLowerCase().includes(name)
  );
}

/**
 * GEO agent (Okara "GEO"): would AI assistants recommend this brand?
 * 1) technical access for AI crawlers, 2) page citability, 3) live visibility test —
 * real shopper questions answered by OpenAI with web search, checking for the brand and competitors.
 */
export const geoAgent: AgentDefinition = {
  key: "geo",
  name: "GEO",
  description: "Checks whether AI assistants like ChatGPT recommend the brand, and what to change so they do.",
  inputSchema: z.object({}).strict(),
  async run(ctx) {
    const { brand } = ctx;
    if (!brand.websiteUrl) throw new Error("Brand has no website URL — add one in Context settings");
    const domain = new URL(brand.websiteUrl).hostname.replace(/^www\./, "").toLowerCase();

    await ctx.log("INFO", `Reading ${brand.websiteUrl} as an AI crawler would`);
    const { facts } = await collectSiteFacts(brand.websiteUrl);
    if (facts.pages.length === 0) throw new Error("Could not read any page from the website");
    const technical = geoTechnicalChecks(facts);
    const crawlers = aiCrawlerAccess(facts.robotsTxt);
    await ctx.log("INFO", `AI crawler access: ${crawlers.filter((c) => c.allowed).length}/${crawlers.length} allowed`);

    // Citability scoring and the visibility test are independent: run them side by side.
    await ctx.log("INFO", "Scoring how quotable each page is, and asking AI assistants shopper questions");
    const citP = ctx.ai.generateObject({
      workflowId: "geo.citability",
      promptVersion: PROMPT_VERSION,
      schema: Citability,
      schemaName: "geo_citability",
      system: GEO_CITABILITY_SYSTEM,
      prompt: facts.pages.map((p) => `### PAGE ${p.url}\nTitle: ${p.title ?? "-"}\n${p.text.slice(0, 4000)}`).join("\n\n"),
      mock: { pages: facts.pages.map((p) => ({ url: p.url, citability: 50, structure: 50, authority: 50 })), findings: [] },
    });
    citP.catch(() => {}); // the error still surfaces at `await citP`; this only avoids an unhandled rejection meanwhile

    const context = await confirmedContext(brand.workspaceId, brand.brandId);
    const q = await ctx.ai.generateObject({
      workflowId: "geo.questions",
      promptVersion: PROMPT_VERSION,
      schema: Questions,
      schemaName: "geo_questions",
      system: GEO_QUESTIONS_SYSTEM,
      prompt: `Brand: ${brand.displayName}\nWebsite: ${brand.websiteUrl}\nLocales: ${JSON.stringify(brand.locales ?? [])}\nWrite exactly ${QUESTION_COUNT} questions.\n\nProduct information:\n${context["product-information"] ?? facts.pages.map((p) => p.text.slice(0, 1500)).join("\n").slice(0, 6000)}`,
      mock: { questions: [`Best solid wood furniture brands?`] },
    });

    // ponytail: all questions in parallel (~1 min total instead of ~1 min each); a failed answer fails
    // the run and the job retries it. Ceiling: the 60 s Vercel job route — see design §8f.
    const results = await Promise.all(
      q.questions.slice(0, QUESTION_COUNT).map(async (question) => {
        const a = await ctx.ai.generateObject({
          workflowId: "geo.visibility",
          promptVersion: PROMPT_VERSION,
          schema: Answer,
          schemaName: "geo_answer",
          system: GEO_ANSWER_SYSTEM,
          prompt: question,
          webSearch: true,
          mock: { answer: "Mock answer", brandsMentioned: [], sources: [] },
        });
        const mentioned = mentionsBrand(a, brand.displayName, domain);
        await ctx.log(mentioned ? "SUCCESS" : "WARN", `"${question}" — ${mentioned ? "brand mentioned" : `not mentioned; named: ${a.brandsMentioned.slice(0, 5).join(", ") || "no brands"}`}`);
        return { question, mentioned, brands: a.brandsMentioned, sources: a.sources.slice(0, 8) };
      }),
    );
    const cit = await citP;
    const contentFindings: Finding[] = cit.findings.map((f, i) => ({ id: `content-${i + 1}`, category: "Content (AI review)", ...f }));

    const competitorCounts = new Map<string, number>();
    for (const r of results)
      for (const b of new Set(r.brands))
        if (!mentionsBrand({ answer: "", brandsMentioned: [b], sources: [] }, brand.displayName, domain))
          competitorCounts.set(b, (competitorCounts.get(b) ?? 0) + 1);
    const competitors = [...competitorCounts].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, mentions]) => ({ name, mentions }));

    const visibility = results.length ? (100 * results.filter((r) => r.mentioned).length) / results.length : 0;
    const citability = avg(cit.pages.map((p) => (p.citability + p.structure + p.authority) / 3));
    const technicalScore = scoreFindings(technical);
    const score = clamp(0.4 * visibility + 0.3 * citability + 0.3 * technicalScore);
    const findings = [...technical, ...contentFindings];
    if (visibility === 0) {
      findings.unshift({ id: "not-recommended", category: "Visibility", severity: "high", title: "AI assistants don't mention the brand yet", detail: `None of the ${results.length} shopper questions returned ${brand.displayName}. Brands named instead: ${competitors.slice(0, 5).map((c) => c.name).join(", ") || "none"}.`, fix: "Build brand mentions where AI assistants look: press and blog features, Reddit and YouTube discussions, comparison and 'best of' lists, and a Wikipedia/Wikidata entry if notable." });
    }

    const ai = await ctx.ai.generateObject({
      workflowId: "geo.prioritise",
      promptVersion: PROMPT_VERSION,
      schema: Prioritised,
      schemaName: "geo_priorities",
      system: GEO_SUMMARY_SYSTEM,
      prompt: JSON.stringify({ brand: brand.displayName, score, visibility: results, competitors, crawlers, citability: cit.pages, findings }),
      mock: { summary: `Mentioned in ${results.filter((r) => r.mentioned).length}/${results.length} AI answers. Drafted without a real AI provider.`, priorities: findings.map((f) => ({ findingId: f.id, why: f.detail })) },
    });

    const report = await saveAuditReport({
      workspaceId: brand.workspaceId,
      brandId: brand.brandId,
      kind: "GEO",
      score,
      summary: ai.summary,
      findings: applyPriorities(findings, ai.priorities),
      metrics: {
        visibility: clamp(visibility),
        citability: clamp(citability),
        technical: technicalScore,
        questions: results,
        competitors,
        crawlers,
        hasLlmsTxt: facts.hasLlmsTxt,
        pages: cit.pages,
      },
      agentRunId: ctx.runId,
    });
    await ctx.log("SUCCESS", `GEO report ready — ${score}/100, mentioned in ${results.filter((r) => r.mentioned).length}/${results.length} AI answers`, { type: "AuditReport", id: report.id });
    return { score, visibility: clamp(visibility) };
  },
};
