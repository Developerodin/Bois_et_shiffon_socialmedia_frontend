"use client";

import { useCallback, useEffect, useState } from "react";
import { AgentLog } from "@/components/agents/agent-log";
import { AgentTile } from "@/components/agents/agent-tile";
import { fetchAgents, type AgentSummary } from "@/components/agents/api";
import { ServiceUnavailable } from "@/components/agents/service-unavailable";

// Agents list refresh cadence. Polling is fine at Slice 0 scale (one tab per
// manager, a handful of agents); move to SSE if many viewers per brand appear.
const AGENTS_POLL_MS = 5000;

type Props = {
  workspaceId: string;
  brandId: string;
};

type LoadState =
  | { kind: "loading" }
  | { kind: "ready"; agents: AgentSummary[] }
  | { kind: "error" };

export function AgentsBoard({ workspaceId, brandId }: Props) {
  const [state, setState] = useState<LoadState>({ kind: "loading" });

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const data = await fetchAgents(workspaceId, brandId, signal);
        setState({ kind: "ready", agents: data.agents ?? [] });
      } catch (err) {
        if (signal?.aborted) return;
        console.error("[agents] failed to load agents", err);
        setState({ kind: "error" });
      }
    },
    [workspaceId, brandId],
  );

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      await load(controller.signal);
      if (!controller.signal.aborted) timer = setTimeout(tick, AGENTS_POLL_MS);
    };
    void tick();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <section aria-labelledby="agents-heading" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2
              id="agents-heading"
              className="font-display text-3xl font-medium tracking-tight sm:text-4xl"
            >
              Your agents
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Each one works on the active brand. Run one now, or watch the log below.
            </p>
          </div>
        </div>

        {state.kind === "loading" ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-44 animate-pulse rounded-2xl border border-border bg-card motion-reduce:animate-none"
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
