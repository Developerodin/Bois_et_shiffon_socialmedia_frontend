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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function base(workspaceId: string, brandId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (!res.ok) {
    throw new ApiError(res.status, `Request failed (${res.status})`);
  }
  return (await res.json()) as T;
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
