import type { ContentChannel } from "@prisma/client";
import { z } from "zod";
import { NothingToDoError, startAgentRun } from "@/server/agents/engine";
import { CONTENT_PROMPT_VERSION, PLANNER_SYSTEM } from "@/server/agents/prompts/content";
import type { AgentDefinition } from "@/server/agents/types";
import { nextSlot, takenKey } from "@/server/content/calendar";
import { brandKnowledge } from "@/server/content/knowledge";
import { prisma } from "@/server/db/prisma";

// No INSTAGRAM_REEL: a planned reel would have a script but no video to post. Reels are made in the app's Studio.
const CHANNELS = ["INSTAGRAM_POST", "INSTAGRAM_CAROUSEL", "FACEBOOK_POST", "PINTEREST_PIN", "THREADS_POST"] as const;
const Plan = z.object({
  posts: z.array(z.object({ opportunityId: z.string(), title: z.string(), channel: z.enum(CHANNELS), pillar: z.string(), angle: z.string() })),
});
const MAX_OPPORTUNITIES = 5;

/**
 * Planner: shortlisted opportunities → posts on the 30-day calendar. The AI proposes posts and
 * channels; dates come from the deterministic cadence (server/content/calendar.ts).
 * Falls back to the top RECOMMEND ideas when nobody has shortlisted yet, and says so.
 */
export const plannerAgent: AgentDefinition = {
  key: "planner",
  name: "Planner",
  description: "Turns shortlisted ideas into dated posts on your 30-day calendar.",
  // chain: start the next agent of the posts chain when done (Planner → Brief writer → Creator → Quality), the app's "Generate calendar".
  inputSchema: z.object({ chain: z.boolean().optional() }).strict(),
  async run(ctx, input) {
    const { brand } = ctx;
    let opps = await prisma.opportunity.findMany({
      where: { brandId: brand.brandId, status: "SHORTLISTED" },
      orderBy: { score: "desc" },
      take: MAX_OPPORTUNITIES,
    });
    if (!opps.length) {
      opps = await prisma.opportunity.findMany({
        where: { brandId: brand.brandId, status: "NEW", decision: "RECOMMEND" },
        orderBy: { score: "desc" },
        take: 3,
      });
      if (!opps.length) throw new NothingToDoError("No ideas to plan: run Opportunities, then shortlist the ideas you like");
      await ctx.log("WARN", "Nothing shortlisted yet: planning the top recommended ideas. Shortlist ideas to choose yourself.");
    }

    const knowledge = await brandKnowledge(brand.workspaceId, brand.brandId, 2500);
    await ctx.log("INFO", `Planning ${opps.length} idea(s)`);
    const out = await ctx.ai.generateObject({
      workflowId: "planner.plan",
      promptVersion: CONTENT_PROMPT_VERSION,
      schema: Plan,
      schemaName: "content_plan",
      system: PLANNER_SYSTEM,
      prompt: `Brand: ${brand.displayName}\n\nIdeas to plan (use the exact opportunityId):\n${opps
        .map((o) => `- id=${o.id} | ${o.title} | angle: ${o.angle} | suggested channels: ${o.channels.join(", ")} | timing: ${o.timing ?? "any"}`)
        .join("\n")}\n\nBrand knowledge:\n${knowledge.text}`,
      mock: {
        posts: opps.flatMap((o) => [
          { opportunityId: o.id, title: `${o.title} (carrousel)`, channel: "INSTAGRAM_CAROUSEL" as const, pillar: "Conseils", angle: o.angle },
          { opportunityId: o.id, title: `${o.title} (épingle)`, channel: "PINTEREST_PIN" as const, pillar: "Inspiration", angle: o.angle },
        ]),
      },
    });

    // Dates: start tomorrow, respect cadence and what's already on the calendar.
    const existing = await prisma.contentItem.findMany({
      where: { brandId: brand.brandId, scheduledFor: { not: null }, status: { notIn: ["CANCELLED", "REJECTED"] } },
      select: { channel: true, scheduledFor: true },
    });
    const taken = new Set(existing.map((e) => takenKey(e.channel, e.scheduledFor!)));
    const from = new Date(Date.now() + 86_400_000);
    // A retried run (cut off after creating some posts) must not plan the same idea twice.
    const done = await prisma.contentItem.findMany({ where: { brandId: brand.brandId, opportunityId: { in: opps.map((o) => o.id) } }, select: { opportunityId: true } });
    const already = new Set(done.map((d) => d.opportunityId));
    const valid = new Set(opps.map((o) => o.id).filter((id) => !already.has(id)));
    let planned = 0;
    let unscheduled = 0;
    for (const p of out.posts) {
      if (!valid.has(p.opportunityId)) continue; // model invented an id
      const when = nextSlot(p.channel as ContentChannel, from, taken);
      if (!when) unscheduled++;
      const item = await prisma.contentItem.create({
        data: {
          workspaceId: brand.workspaceId,
          brandId: brand.brandId,
          opportunityId: p.opportunityId,
          title: p.title,
          channel: p.channel,
          pillar: p.pillar,
          scheduledFor: when,
          brief: { angle: p.angle },
        },
      });
      planned++;
      await ctx.log("SUCCESS", `Planned ${p.channel.replace(/_/g, " ").toLowerCase()}${when ? ` for ${when.toISOString().slice(0, 10)}` : " (no free slot in 30 days)"}: ${p.title}`, { type: "ContentItem", id: item.id });
    }
    await prisma.opportunity.updateMany({ where: { id: { in: opps.map((o) => o.id) } }, data: { status: "PLANNED" } });
    if (unscheduled) await ctx.log("WARN", `${unscheduled} post(s) had no free slot in the next 30 days`);
    if ((input as { chain?: boolean }).chain && planned) await startAgentRun({ workspaceId: brand.workspaceId, brandId: brand.brandId, agentKey: "brief", trigger: "event", input: { chain: true } }).catch(() => null);
    return { planned, unscheduled };
  },
};
