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

export { ApiError } from "@/components/settings/api";

function base(workspaceId: string, brandId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
}

export function fetchAgents(workspaceId: string, brandId: string, signal?: AbortSignal) {
  return request<{ agents: AgentSummary[] }>(`${base(workspaceId, brandId)}/agents`, { signal });
}

export function startRun(workspaceId: string, brandId: string, agentKey: string) {
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
) {
  const params = new URLSearchParams({ limit: "100" });
  if (after) params.set("after", after);
  return request<{ events: AgentEvent[] }>(
    `${base(workspaceId, brandId)}/agent-events?${params.toString()}`,
    { signal },
  );
}
