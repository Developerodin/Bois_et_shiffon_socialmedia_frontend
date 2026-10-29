import { tool } from "ai";
import { z } from "zod";
import { AGENTS } from "@/server/agents/registry";
import { effectivePermissions } from "@/server/auth/permissions";
import { prisma } from "@/server/db/prisma";
import { latestAuditReports } from "@/server/services/audit-reports";
import { CONTEXT_DOC_KINDS, listContextDocs } from "@/server/services/context-docs";

export type ChatScope = { workspaceId: string; brandId: string; userId: string };

const KINDS = CONTEXT_DOC_KINDS.map((k) => k.kind) as [string, ...string[]];
const RUNNABLE = AGENTS.filter((a) => a.key !== "systems-check" && !a.internal).map((a) => a.key) as [string, ...string[]];

/**
 * What the CMO chat may do. Read-only access to this brand's documents, reports and agents, and
 * offering an agent run (the person starts it with a button; same permission check as the Run button). Deliberately no tool that
 * publishes, posts, replies, spends or approves: drafts only, people decide (design §4.4).
 */
export function chatTools(scope: ChatScope) {
  // Chat sees exactly what the person's role can see on screen: same permissions as the matching pages.
  let perms: Promise<Set<string>> | undefined;
  const can = async (p: string) => (await (perms ??= effectivePermissions(scope.workspaceId, scope.userId, scope.brandId))).has(p);
  const denied = (what: string) => ({ error: `Your role can't see ${what}.` });
  return {
    listDocuments: tool({
      description: "List the brand's five strategy documents with their status (draft or confirmed by the team).",
      inputSchema: z.object({}),
      execute: async () => {
        if (!(await can("agents.read"))) return denied("the strategy documents");
        const docs = await listContextDocs(scope.workspaceId, scope.brandId);
        return docs.map((d) => ({
          kind: d.kind,
          title: d.title,
          status: d.latest ? (d.latest.status === "CONFIRMED" ? "reviewed by the team" : "current") : "not written yet",
        }));
      },
    }),

    readDocument: tool({
      description:
        "Read one strategy document. Prefer it over guessing: product information, marketing strategy, competitor analysis, brand voice, content strategy.",
      inputSchema: z.object({ kind: z.enum(KINDS) }),
      execute: async ({ kind }) => {
        if (!(await can("agents.read"))) return denied("the strategy documents");
        const doc = (await listContextDocs(scope.workspaceId, scope.brandId)).find((d) => d.kind === kind);
        const use = doc?.latest;
        if (!doc || !use) return { kind, status: "not written yet" };
        return {
          kind,
          title: doc.title,
          status: use.status === "CONFIRMED" ? "reviewed by the team" : "current",
          markdown: use.markdown.slice(0, 12_000),
        };
      },
    }),

    getSiteReports: tool({
      description: "Latest SEO audit and AI-visibility (GEO) report: scores, summaries, top fixes, competitors AI recommends.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!(await can("analytics.read"))) return denied("the site reports");
        const { seo, geo } = await latestAuditReports(scope.workspaceId, scope.brandId);
        const brief = (r: typeof seo) =>
          r && {
            score: r.score,
            summary: r.summary,
            ranAt: r.createdAt.toISOString(),
            topFixes: (r.findings as { title: string; severity: string; fix: string }[]).slice(0, 6),
          };
        const m = (geo?.metrics ?? {}) as { competitors?: unknown; questions?: unknown; visibility?: number };
        return {
          seo: brief(seo) ?? "No SEO report yet",
          geo: geo ? { ...brief(geo), visibility: m.visibility, competitors: m.competitors, questions: m.questions } : "No GEO report yet",
        };
      },
    }),

    listAgents: tool({
      description: "List the agents for this brand and the status of their latest run.",
      inputSchema: z.object({}),
      execute: async () => {
        if (!(await can("agents.read"))) return denied("the agents");
        const runs = await prisma.agentRun.findMany({
          where: { workspaceId: scope.workspaceId, brandId: scope.brandId },
          orderBy: { createdAt: "desc" },
          distinct: ["agentKey"],
          select: { agentKey: true, status: true, finishedAt: true, error: true },
        });
        return AGENTS.filter((a) => a.key !== "systems-check" && !a.internal).map((a) => {
          const r = runs.find((x) => x.agentKey === a.key);
          return { key: a.key, name: a.name, does: a.description, lastRun: r ? { status: r.status, finishedAt: r.finishedAt?.toISOString() ?? null, error: r.error?.slice(0, 200) ?? null } : null };
        });
      },
    }),

    // Proposes, never starts: the chat shows a Start button and the person presses it (the Run button's own route).
    // Text injected into a web page or document can steer the model into calling a tool; it can't press a button.
    // (Named startAgent still, so conversations saved before this change keep validating.)
    startAgent: tool({
      description:
        "Offer to start an agent run for this brand (research = re-read the website and redraft the documents; seo = website audit; geo = AI-visibility check). The person sees a Start button and starts it themselves; nothing runs until they press it. Only when the person asks for it.",
      inputSchema: z.object({ agentKey: z.enum(RUNNABLE) }),
      execute: async ({ agentKey }) => {
        if (!(await can("agents.run"))) return { proposed: false, reason: "Your role can't run agents. Ask an owner or admin." };
        return { proposed: true, agentKey, note: "A Start button is shown to the person; the agent runs only if they press it." };
      },
    }),
  };
}
