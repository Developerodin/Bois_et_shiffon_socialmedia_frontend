"use client";

import { useEffect, useState } from "react";
import { AgentEventRow } from "@/components/agents/agent-log";
import { fetchEvents, type AgentEvent } from "@/components/agents/api";
import { RUN_ID_PATTERN } from "@/shared";

/**
 * Where an event's entity lives in the app: only types we know, never a path taken from the event's own text. Absolute,
 * since the run shows on other pages too (/competitors): the Overview opens the post in its peek, as it did on itself.
 */
const hrefFor = (e: AgentEvent) => (e.entityType === "ContentItem" && e.entityId ? `/?post=${encodeURIComponent(e.entityId)}` : undefined);

/**
 * What one run of this agent did, oldest first (the server sends at most 200). One read; read again when `again` changes, which
 * is how a run still going is picked up when it finishes. Event text is shown as plain text.
 * ponytail: the first 200 events only (a longer run is cut); upgrade: page by `after` like the Agent Log.
 */
export function RunEvents({ workspaceId, brandId, agentKey, runId, again }: { workspaceId: string; brandId: string; agentKey: string; runId: string; again?: string }) {
  const [state, setState] = useState<{ runId: string; events: AgentEvent[] } | "failed" | null>(null);

  useEffect(() => {
    if (!RUN_ID_PATTERN.test(runId)) return;
    const ctrl = new AbortController();
    fetchEvents(workspaceId, brandId, null, ctrl.signal, runId, agentKey).then(
      (d) => !ctrl.signal.aborted && setState({ runId, events: d.events ?? [] }),
      () => !ctrl.signal.aborted && setState("failed"),
    );
    return () => ctrl.abort();
  }, [workspaceId, brandId, agentKey, runId, again]);

  const events = state && state !== "failed" && state.runId === runId ? state.events : null;
  if (state === "failed" && !events) return <p className="text-sm text-muted-foreground">Couldn&rsquo;t load what it did.</p>;
  if (!events) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Nothing was logged for this run.</p>;
  return (
    <div className="overflow-hidden rounded-lg bg-terminal px-4 py-3 font-mono text-[13px] leading-6 text-terminal-foreground">
      <ol>
        {events.map((e) => (
          <AgentEventRow key={e.id} event={e} href={hrefFor(e)} />
        ))}
      </ol>
    </div>
  );
}
