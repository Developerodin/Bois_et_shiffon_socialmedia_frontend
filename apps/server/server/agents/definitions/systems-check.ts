import { z } from "zod";
import type { AgentDefinition } from "@/server/agents/types";

/**
 * Demo agent that proves the pipeline end to end: job → run → brand context →
 * AI provider → Agent Log. Replaced in usefulness by real agents from Slice 1.
 */
const Briefing = z.object({
  greeting: z.string(),
  focusIdeas: z.array(z.string()).min(1).max(3),
});

export const systemsCheckAgent: AgentDefinition = {
  key: "systems-check",
  name: "Systems check",
  description: "Verifies brand context, AI provider and the Agent Log are wired.",
  inputSchema: z.object({}).strict(),
  async run(ctx) {
    const b = ctx.brand;
    await ctx.log("INFO", `Loaded brand context for ${b.displayName}`);
    if (!b.websiteUrl) {
      await ctx.log("WARN", "No website URL on brand profile — Research agent will need one");
    }
    const out = await ctx.ai.generateObject({
      workflowId: "systems-check.briefing",
      promptVersion: "1",
      schema: Briefing,
      schemaName: "briefing",
      system:
        "You are a brand's AI CMO. Reply with a one-line greeting and up to three content focus ideas. Never invent product facts.",
      prompt: `Brand: ${b.displayName}\nVoice: ${b.voiceSummary ?? "unknown"}\nPillars: ${JSON.stringify(b.pillars)}`,
      mock: {
        greeting: `Hello ${b.displayName} — the agent pipeline is running (mock AI).`,
        focusIdeas: ["Confirm brand context", "Import the product catalogue"],
      },
    });
    await ctx.log("SUCCESS", out.greeting);
    for (const idea of out.focusIdeas) await ctx.log("INFO", `Focus: ${idea}`);
    return out;
  },
};
