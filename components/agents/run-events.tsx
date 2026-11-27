"use client";

import { useEffect, useState } from "react";
import { AgentEventRow } from "@/components/agents/agent-log";
import { readable } from "@/lib/agent-message";
import { fetchEvents, type AgentEvent } from "@/components/agents/api";
import { RUN_ID_PATTERN } from "@/shared";

/**
 * Where an event's entity lives in the app: only types we know, never a path taken from the event's own text. Absolute,
 * since the run shows on other pages too (/competitors): the Overview opens the post in its peek, as it did on itself.
 */
const hrefFor = (e: AgentEvent) => (e.entityType === "ContentItem" && e.entityId ? `/?post=${encodeURIComponent(e.entityId)}` : undefined);

/**
 * One run's events, oldest first (the server sends at most 200), read once and again when `again` changes (how a run
 * still going is picked up when it finishes). `events` null until read; `failed` when the read failed. `retry` reads again.
 */
export function useRunEvents(workspaceId: string, brandId: string, agentKey: string, runId: string | null, again?: string) {
  const [state, setState] = useState<{ runId: string; events: AgentEvent[] } | "failed" | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!runId) return;
    // An id that isn't a run's would otherwise leave "Loading…" up for good.
    if (!RUN_ID_PATTERN.test(runId)) return setState("failed");
    const ctrl = new AbortController();
    fetchEvents(workspaceId, brandId, null, ctrl.signal, runId, agentKey).then(
      (d) => !ctrl.signal.aborted && setState({ runId, events: d.events ?? [] }),
      () => !ctrl.signal.aborted && setState("failed"),
    );
    return () => ctrl.abort();
  }, [workspaceId, brandId, agentKey, runId, again, nonce]);

  const events = state && state !== "failed" && state.runId === runId ? state.events : null;
  return { events, failed: state === "failed", retry: () => setNonce((n) => n + 1) };
}

/**
 * What one run of this agent did, oldest first (the server sends at most 200). One read; read again when `again` changes, which
 * is how a run still going is picked up when it finishes. Event text is shown as plain text.
 * ponytail: the first 200 events only (a longer run is cut); upgrade: page by `after` like the Agent Log.
 */
export function RunEvents({ workspaceId, brandId, agentKey, runId, again, onOpenPost, log: showLog = true, onPosts }: { workspaceId: string; brandId: string; agentKey: string; runId: string; again?: string; /** Open a post in place (a peek on this page); with it, the posts the run worked on are listed above the log. */ onOpenPost?: (id: string) => void; /** false: only the posts list, no log (the calendar's and Channels' peek). */ log?: boolean; /** The run's post ids, once read. */ onPosts?: (ids: string[]) => void }) {
  const { events, failed } = useRunEvents(workspaceId, brandId, agentKey, runId, again);
  if (failed && !events) return <p className="text-sm text-muted-foreground">Couldn&rsquo;t load what it did.</p>;
  if (!events) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (events.length === 0) return <p className="text-sm text-muted-foreground">Nothing was logged for this run.</p>;
  // The posts it worked on, each once, named by its latest line in this run (newest first).
  const posts = new Map<string, string>();
  if (onOpenPost) for (const e of [...events].reverse()) if (e.entityType === "ContentItem" && e.entityId && !posts.has(e.entityId)) posts.set(e.entityId, readable(e.message));
  const ids = [...posts.keys()].join();
  const log = (
    <div className="overflow-hidden rounded-lg bg-terminal px-4 py-3 font-mono text-[13px] leading-6 text-terminal-foreground">
      <ol>
        {events.map((e) => (
          <AgentEventRow key={e.id} event={e} href={onOpenPost ? undefined : hrefFor(e)} />
        ))}
      </ol>
    </div>
  );
  if (!posts.size) {
    return (
      <>
        {showLog ? log : <p className="text-sm text-muted-foreground">This run didn&rsquo;t work on any post.</p>}
        {onPosts && <ReportPosts ids="" onPosts={onPosts} />}
      </>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label="Posts this run worked on" className="divide-y divide-border rounded-xl border border-border">
        {[...posts].map(([id, line]) => (
          <li key={id}>
            <button type="button" onClick={() => onOpenPost!(id)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
              <span className="min-w-0 truncate">{line}</span>
              <span className="shrink-0 text-xs text-muted-foreground">Open post</span>
            </button>
          </li>
        ))}
      </ul>
      {showLog && log}
      {onPosts && <ReportPosts ids={ids} onPosts={onPosts} />}
    </div>
  );
}

/** Tells the caller the run's post ids once they're read (an effect, never during render). */
function ReportPosts({ ids, onPosts }: { ids: string; onPosts: (ids: string[]) => void }) {
  useEffect(() => onPosts(ids ? ids.split(",") : []), [ids, onPosts]);
  return null;
}
