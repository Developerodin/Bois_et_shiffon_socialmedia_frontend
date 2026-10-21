import type { ContentChannel, Prisma } from "@prisma/client";
import { z } from "zod";
import { CONTENT_PROMPT_VERSION, QUALITY_SYSTEM } from "@/server/agents/prompts/content";
import type { AgentDefinition } from "@/server/agents/types";
import { brandKnowledge } from "@/server/content/knowledge";
import { checkDraft, overallOf, type CheckResult, type DraftBody } from "@/server/content/rules";
import { prisma } from "@/server/db/prisma";
import { lock, TX } from "@/server/services/publishing";

const Review = z.object({
  results: z.array(z.object({ check: z.string(), status: z.enum(["pass", "warn", "blocker"]), note: z.string() })),
});
const PER_RUN = 10;

/** Optional French grammar pass via a LanguageTool server (LANGUAGETOOL_URL, e.g. http://localhost:8010). */
async function languageTool(text: string): Promise<CheckResult | null> {
  const base = process.env.LANGUAGETOOL_URL;
  if (!base || !text.trim()) return null;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/v2/check`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ text, language: "fr" }),
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { matches?: { message: string; context: { text: string } }[] };
    const m = body.matches ?? [];
    return m.length
      ? { check: "French grammar (LanguageTool)", status: "warn", note: m.slice(0, 3).map((x) => `${x.message} (« ${x.context.text.trim()} »)`).join("; ") }
      : { check: "French grammar (LanguageTool)", status: "pass", note: "No issues found." };
  } catch {
    return null; // LanguageTool down: the AI review still covers language quality
  }
}

/**
 * Quality check: deterministic rules (server/content/rules.ts) + optional LanguageTool + an AI
 * review of voice, product accuracy, language and CTA. Pass/warn → awaiting approval (a person
 * approves); blocker → stays in draft review for the Creator or an editor to fix.
 */
export const qualityAgent: AgentDefinition = {
  key: "quality",
  name: "Quality check",
  description: "Checks each draft for brand voice, product accuracy, French quality and platform rules before approval.",
  inputSchema: z.object({}).strict(),
  async run(ctx) {
    const { brand } = ctx;
    const items = await prisma.contentItem.findMany({
      where: { brandId: brand.brandId, status: "DRAFT_REVIEW" },
      include: { versions: { orderBy: { version: "desc" }, take: 1, include: { checks: { select: { id: true } } } } },
      take: 50,
    });
    const todo = items.filter((i) => i.versions[0] && i.versions[0].checks.length === 0).slice(0, PER_RUN);
    if (!todo.length) throw new Error("No new drafts to check: run the Creator first");
    const knowledge = await brandKnowledge(brand.workspaceId, brand.brandId, 4000);
    let checked = 0;

    for (const item of todo) {
      const v = item.versions[0];
      const body = v.body as unknown as DraftBody;
      const rules = checkDraft(item.channel as ContentChannel, body);
      const lt = await languageTool([body.hook, body.caption, ...(body.slides ?? [])].join("\n"));
      const ai = await ctx.ai.generateObject({
        workflowId: "quality.review",
        promptVersion: CONTENT_PROMPT_VERSION,
        schema: Review,
        schemaName: "quality_review",
        system: QUALITY_SYSTEM,
        prompt: `Brand: ${brand.displayName}\nChannel: ${item.channel}\nBrief: ${JSON.stringify(item.brief)}\nDraft v${v.version}: ${JSON.stringify(body)}\nRule-based results already found: ${JSON.stringify(rules)}\n\nBrand knowledge:\n${knowledge.text}`,
        mock: {
          results: [
            { check: "Brand voice", status: "pass", note: "Calm, practical tone consistent with the voice document." },
            { check: "Product accuracy", status: "pass", note: "No specific product claims." },
            { check: "Language quality", status: "pass", note: "Correct French." },
            { check: "Call to action", status: "pass", note: "One clear ask (save)." },
          ],
        },
      });
      const results = [...rules, ...(lt ? [lt] : []), ...ai.results];
      const overall = overallOf(results);
      // The check takes a while: a newer draft (or any status change) since we started wins.
      const saved = await prisma.$transaction(async (tx) => {
        await lock(tx, item.id);
        const now = await tx.contentItem.findUnique({ where: { id: item.id }, select: { status: true, versions: { orderBy: { version: "desc" }, take: 1, select: { id: true } } } });
        if (now?.status !== "DRAFT_REVIEW" || now.versions[0]?.id !== v.id) return false;
        await tx.qualityCheck.create({ data: { contentVersionId: v.id, overall, results: results as Prisma.InputJsonValue, agentRunId: ctx.runId } });
        await tx.contentItem.update({ where: { id: item.id }, data: { status: overall === "BLOCKER" ? "DRAFT_REVIEW" : "AWAITING_APPROVAL" } });
        return true;
      }, TX);
      if (!saved) {
        await ctx.log("WARN", `Skipped (the draft changed while I was checking it): ${item.title}`, { type: "ContentItem", id: item.id });
        continue;
      }
      checked++;
      const problems = results.filter((r) => r.status !== "pass").length;
      await ctx.log(
        overall === "BLOCKER" ? "WARN" : "SUCCESS",
        `${overall === "BLOCKER" ? "Needs fixes" : overall === "WARN" ? "Ready for approval, with notes" : "Ready for approval"} (v${v.version}, ${problems} note${problems === 1 ? "" : "s"}): ${item.title}`,
        { type: "ContentItem", id: item.id },
      );
    }
    return { checked };
  },
};
