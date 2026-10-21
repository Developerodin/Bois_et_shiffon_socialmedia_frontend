import { tool } from "ai";
import { z } from "zod";
import { AgentStartError, startAgentRun } from "@/server/agents/engine";
import { AGENTS } from "@/server/agents/registry";
import { effectivePermissions } from "@/server/auth/permissions";
import { prisma } from "@/server/db/prisma";
import { kickRunner } from "@/server/jobs/runner";
import { latestAuditReports } from "@/server/services/audit-reports";
import { CONTEXT_DOC_KINDS, listContextDocs } from "@/server/services/context-docs";

export type ChatScope = { workspaceId: string; brandId: string; userId: string };

const KINDS = CONTEXT_DOC_KINDS.map((k) => k.kind) as [string, ...string[]];
const RUNNABLE = AGENTS.filter((a) => a.key !== "systems-check" && !a.internal).map((a) => a.key) as [string, ...string[]];

/**
 * What the CMO chat may do. Read-only access to this brand's documents, reports and agents, and
 * starting an agent run (the same permission check as the Run button). Deliberately no tool that
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
          status: d.latest ? (d.latest.status === "CONFIRMED" ? "confirmed" : "draft, not yet confirmed") : "not written yet",
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
        const use = doc?.confirmed ?? doc?.latest;
        if (!doc || !use) return { kind, status: "not written yet" };
        return {
          kind,
          title: doc.title,
          status: use.status === "CONFIRMED" ? "confirmed" : "draft, not yet confirmed by the team",
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

    startAgent: tool({
      description:
        "Start an agent run for this brand (research = re-read the website and redraft the documents; seo = website audit; geo = AI-visibility check). Only when the person asks for it.",
      inputSchema: z.object({ agentKey: z.enum(RUNNABLE) }),
      execute: async ({ agentKey }) => {
        if (!(await can("agents.run"))) return { started: false, reason: "Your role can't run agents. Ask an owner or admin." };
        try {
          const run = await startAgentRun({ ...scope, agentKey, trigger: "manual" });
          kickRunner();
          return { started: true, runId: run.id, note: "Running in the background. Progress shows in Logs." };
        } catch (e) {
          return { started: false, reason: e instanceof AgentStartError ? e.message : "Could not start the agent." };
        }
      },
    }),
  };
}
