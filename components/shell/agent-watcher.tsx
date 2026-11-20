"use client";

import { useEffect, useRef } from "react";
import { agentsUrl, type AgentSummary } from "@/components/agents/api";
import { clearToasts, toast } from "@/components/ui/toast";
import { JOB_INTERVALS, sharedAt, useJob } from "@/components/workspace/use-job";
import { finishedRuns, takeBaseline } from "@/lib/agent-runs";
import { readable } from "@/lib/agent-message";
import { viewToSearch } from "@/lib/workspace-view";

const pickAgents = (d: { agents: AgentSummary[] }) => d.agents;
const STOP_ON = [403] as const;
const KEEP = 50;

/**
 * Toasts "<agent> finished" / "<agent> needs a look" when a run ends while the person is anywhere in the app, with a
 * link to the agent's view of that run. Renders nothing. It joins the shared per-URL request the Overview and the
 * agents board poll, so it adds one request per 20 s at most, and none while the tab is hidden.
 * ponytail: two tabs polling the same second can both toast (the id list below is read just before, not locked); and
 * GET /agents sends only each agent's newest run, so a run followed within one poll by another can be missed.
 */
export function AgentWatcher({ workspaceId, brandId }: { workspaceId: string; brandId: string }) {
  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  const url = agentsUrl(base);
  const { data } = useJob(url, { pick: pickAgents as (d: never) => AgentSummary[], intervals: JOB_INTERVALS.agentWatch, stopOn: STOP_ON });
  const prev = useRef<AgentSummary[] | null>(null);
  const baseline = useRef<string | null | undefined>(undefined);
  const mountedAt = useRef(Date.now());

  // Keyed by brand in the layout: switching brands unmounts this, and the old brand's toasts go with it.
  useEffect(() => clearToasts, []);

  useEffect(() => {
    if (!data) return;
    // The first answer fetched after this mounted only sets what counts as new, in the server's time. One already in
    // the shared cache when it mounted is skipped: it would set a baseline older than runs that finished since.
    if (baseline.current === undefined) {
      baseline.current = takeBaseline(data, sharedAt(url), mountedAt.current);
      if (baseline.current !== undefined) prev.current = data;
      return;
    }
    const runs = finishedRuns(prev.current, data, baseline.current);
    prev.current = data;
    if (runs.length === 0) return;
    const storeKey = `agent-toasted:${workspaceId}:${brandId}`;
    let seen: string[] = [];
    try {
      const raw = JSON.parse(localStorage.getItem(storeKey) ?? "[]");
      if (Array.isArray(raw)) seen = raw.filter((x): x is string => typeof x === "string");
    } catch {}
    for (const r of runs) {
      if (seen.includes(r.runId)) continue;
      seen.push(r.runId);
      if (r.status === "idle") continue;
      toast({
        title: r.status === "done" ? `${r.name} finished` : `${r.name} needs a look`,
        detail: r.status === "failed" && r.error ? readable(r.error) : undefined,
        // On the Overview the link keeps its filters and ?panel=. ponytail: fixed when the toast is made, so a person who
        // has since left the Overview gets those too; harmless there (the Overview ignores what it doesn't know).
        href: window.location.pathname === "/" ? `/${viewToSearch({ kind: "agent", key: r.key, runId: r.runId }, window.location.search, "/")}` : `/?agent=${encodeURIComponent(r.key)}&runId=${encodeURIComponent(r.runId)}`,
        tone: r.status === "done" ? "success" : "warning",
      });
    }
    try {
      localStorage.setItem(storeKey, JSON.stringify(seen.slice(-KEEP)));
    } catch {}
  }, [data, url, workspaceId, brandId]);

  return null;
}
