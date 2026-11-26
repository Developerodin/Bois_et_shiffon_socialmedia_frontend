"use client";

import { agentsUrl, type AgentSummary } from "@/components/agents/api";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";

const pickAgents = (d: { agents?: AgentSummary[] }) => d.agents ?? [];

/**
 * The brand's agents, read every 5 s while `on`, on the shared per-URL request (fetchAgents joins it, and a fresh
 * fetchAgents after a run starts updates this too). It pauses while the tab is hidden and reads again when it shows,
 * and backs off on errors (useJob). `failed`: the last read failed; it clears on the next success.
 * ponytail: the Overview polls docs and agents together with its own loop (workspace.tsx); it doesn't use this yet.
 */
export function useAgentsPoll(workspaceId: string, brandId: string, on = true) {
  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  const { data, failed } = useJob(agentsUrl(base), { pick: pickAgents as (d: never) => AgentSummary[], intervals: JOB_INTERVALS.agents, off: !on });
  return { agents: data, failed };
}
