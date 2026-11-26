"use client";

import { useCallback } from "react";
import { AgentLog } from "@/components/agents/agent-log";
import { AgentTile } from "@/components/agents/agent-tile";
import { fetchAgents, type AgentSummary } from "@/components/agents/api";
import { ServiceUnavailable } from "@/components/agents/service-unavailable";
import { useAgentsPoll } from "@/components/agents/use-agents-poll";
import { PageHeader } from "@/components/ui/page-header";

type Props = {
  workspaceId: string;
  brandId: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; agents: AgentSummary[] }
  | { kind: "error" };

export function AgentsBoard({ workspaceId, brandId }: Props) {
  // Polled every 5 s, not while the tab is hidden. Polling is fine at this scale (one tab per manager, a handful of
  // agents); move to SSE if many viewers per brand appear.
  const { agents, failed } = useAgentsPoll(workspaceId, brandId);
  const state: LoadState = failed ? { kind: "error" } : agents ? { kind: "ready", agents } : { kind: "loading" };
  // A fresh read (Retry, a run just started) reaches the poll through the shared request; a failure shows as `failed`.
  const load = useCallback(() => fetchAgents(workspaceId, brandId, true).then(() => undefined, () => console.error("[agents] failed to load agents")), [workspaceId, brandId]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-5">
      <section className="flex flex-col gap-5">
        <PageHeader title="Your agents">
          Each one works on the active brand. Run one now, or watch the log below.
        </PageHeader>

        {state.kind === "loading" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl bg-border motion-reduce:animate-none"
              />
            ))}
            <span className="sr-only">Loading agents</span>
          </div>
        ) : state.kind === "error" ? (
          <ServiceUnavailable onRetry={() => void load()} />
        ) : state.agents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border px-6 py-10">
            <p className="font-display text-xl">No agents installed for this brand yet.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Agents appear here once they are registered for the brand.
            </p>
          </div>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {state.agents.map((agent) => (
              <li key={agent.key}>
                <AgentTile
                  agent={agent}
                  workspaceId={workspaceId}
                  brandId={brandId}
                  onRunStarted={() => void load()}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <AgentLog workspaceId={workspaceId} brandId={brandId} />
    </div>
  );
}
