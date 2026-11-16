// Client-side contract for the context-docs and brand-creation API.
// Keep these types in sync with the route handlers under app/api/v1.

import type { RunStatus } from "@/components/agents/api";
import type { ContextRequest } from "@espanda/shared";
import { NetworkError, send } from "@/lib/net";

export type ContextDocKind =
  | "product-information"
  | "marketing-strategy"
  | "competitor-analysis"
  | "brand-voice"
  | "content-strategy";

export const DOC_KINDS: ContextDocKind[] = ["product-information", "marketing-strategy", "competitor-analysis", "brand-voice", "content-strategy"];

export type ContextDoc = {
  id: string;
  version: number;
  status: "DRAFT" | "CONFIRMED" | "SUPERSEDED";
  markdown: string;
  sources: Array<{ url: string; title: string | null }>;
  createdAt: string;
  createdBy: "agent" | "user";
  confirmedAt: string | null;
};

export type ContextDocEntry = {
  kind: ContextDocKind;
  title: string;
  latest: ContextDoc | null;
  confirmed: ContextDoc | null;
};

export type ContextDocsResponse = {
  docs: ContextDocEntry[];
  research: { runId: string; status: RunStatus; error?: string | null } | null;
};

/** Error carrying the problem+json `detail` (or `title`) when the server sent one. */
export class ProblemError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await send(url, {
      cache: "no-store",
      ...init,
      headers: init?.body
        ? { "content-type": "application/json", ...init.headers }
        : init?.headers,
    });
  } catch (error) {
    // Offline, timed out, server unreachable: status 0, with a message that says which (lib/net.ts).
    if (error instanceof NetworkError) throw new ProblemError(0, error.message);
    throw error;
  }
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const problem = (await res.json()) as { title?: string; detail?: string };
      message = problem.detail || problem.title || message;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ProblemError(res.status, message);
  }
  return (await res.json()) as T;
}

function ws(workspaceId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;
}

function brandBase(workspaceId: string, brandId: string) {
  return `${ws(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
}

export function createBrand(
  workspaceId: string,
  body: { displayName: string; websiteUrl: string },
) {
  return request<{
    brand: { id: string; slug: string; displayName: string };
    researchRunId: string;
  }>(`${ws(workspaceId)}/brands`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/** Make a workspace (and optionally one of its brands) the active one; the server sets the cookies. */
export function setActiveContext(body: ContextRequest) {
  return request<{ ok: true }>("/api/v1/me/context", { method: "POST", body: JSON.stringify(body) });
}

export function fetchContextDocs(
  workspaceId: string,
  brandId: string,
  signal?: AbortSignal,
) {
  return request<ContextDocsResponse>(
    `${brandBase(workspaceId, brandId)}/context-docs`,
    {
      signal,
    },
  );
}

export function saveContextDoc(
  workspaceId: string,
  brandId: string,
  kind: ContextDocKind,
  body: { markdown: string; baseVersion: number | null },
) {
  return request<{ doc: ContextDoc }>(
    `${brandBase(workspaceId, brandId)}/context-docs/${kind}`,
    { method: "PUT", body: JSON.stringify(body) },
  );
}

export function confirmContextDoc(
  workspaceId: string,
  brandId: string,
  kind: ContextDocKind,
  version: number,
) {
  return request<{ doc: ContextDoc }>(
    `${brandBase(workspaceId, brandId)}/context-docs/${kind}/confirm`,
    { method: "POST", body: JSON.stringify({ version }) },
  );
}

export function startResearch(workspaceId: string, brandId: string) {
  return request<{ run: { id: string; status: RunStatus } }>(
    `${brandBase(workspaceId, brandId)}/agents/research/runs`,
    { method: "POST", body: JSON.stringify({}) },
  );
}
