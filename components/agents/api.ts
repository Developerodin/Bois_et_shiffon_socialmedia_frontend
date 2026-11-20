// Client-side contract for the agents API (app/api/v1/.../agents, agent-events).
// Keep these types in sync with the route handlers.

export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";

export type AgentSummary = {
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  lastRun: {
    id: string;
    status: RunStatus;
    startedAt: string | null;
    finishedAt: string | null;
    /** Last failure reason, only for FAILED runs. */
    error?: string | null;
  } | null;
};

export type AgentEventLevel = "INFO" | "SUCCESS" | "WARN" | "ERROR";

export type AgentEvent = {
  id: string;
  runId: string;
  agentKey: string;
  createdAt: string;
  level: AgentEventLevel;
  message: string;
  entityType: string | null;
  entityId: string | null;
};

// One fetch helper for the app: it surfaces the server's own explanation (problem detail).
import { request } from "@/components/settings/api";
import { ensureWorkLanguage } from "@/components/languages/languages";
import { fetchShared } from "@/components/workspace/use-job";

export { ApiError } from "@/components/settings/api";

function base(workspaceId: string, brandId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
}

/** The agents list's URL: the key the shared per-URL cache (use-job) holds it under. */
export const agentsUrl = (brandBase: string) => `${brandBase}/agents`;

/**
 * The brand's agents, from the shared per-URL request: the Overview, the agents board, the post panels and the
 * shell's watcher all join one request. `fresh`: a reload after a change (a run just started).
 */
export function fetchAgents(workspaceId: string, brandId: string, fresh = false) {
  return fetchShared(agentsUrl(base(workspaceId, brandId)), fresh) as Promise<{ agents: AgentSummary[] }>;
}

/** Starts a run; asks for the team language first if the business has none yet (throws RunCancelled on Cancel). */
export async function startRun(workspaceId: string, brandId: string, agentKey: string) {
  await ensureWorkLanguage(base(workspaceId, brandId));
  return request<{ run: { id: string; status: string } }>(
    `${base(workspaceId, brandId)}/agents/${encodeURIComponent(agentKey)}/runs`,
    { method: "POST" },
  );
}

export function fetchEvents(
  workspaceId: string,
  brandId: string,
  after: string | null,
  signal?: AbortSignal,
  runId?: string,
  agentKey?: string,
) {
  const params = new URLSearchParams({ limit: "100" });
  if (after) params.set("after", after);
  if (runId) params.set("runId", runId);
  if (agentKey) params.set("agentKey", agentKey);
  return request<{ events: AgentEvent[] }>(
    `${base(workspaceId, brandId)}/agent-events?${params.toString()}`,
    { signal },
  );
}
