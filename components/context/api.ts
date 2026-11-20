// Client-side contract for the context-docs and brand-creation API.
// Keep these types in sync with the route handlers under app/api/v1.

import type { RunStatus } from "@/components/agents/api";
import type { ContextDocKind, ContextRequest } from "@/shared";
import { request } from "@/components/settings/api";
import { SLOW_MS } from "@/lib/net";
import { brandBase, ensureWorkLanguage } from "@/components/languages/languages";
import { forgetOpenItem } from "@/lib/workspace-view";

// The kinds live in shared/ so the Overview's URL check and the API agree on one list.
export { DOC_KINDS, type ContextDocKind } from "@/shared";

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

export { ApiError as ProblemError } from "@/components/settings/api";

function ws(workspaceId: string) {
  return `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;
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
    timeoutMs: SLOW_MS,
  });
}

/** Make a workspace (and optionally one of its brands) the active one; the server sets the cookies. */
export async function setActiveContext(body: ContextRequest) {
  const r = await request<{ ok: true }>("/api/v1/me/context", { method: "POST", body: JSON.stringify(body) });
  // An item open on the Overview belongs to the old brand: the new brand's Overview starts with nothing open.
  forgetOpenItem(window.location.pathname);
  return r;
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

/** Starts Research; asks for the team language first if the business has none yet (throws RunCancelled on Cancel). */
export async function startResearch(workspaceId: string, brandId: string) {
  await ensureWorkLanguage(brandBase(workspaceId, brandId));
  return request<{ run: { id: string; status: RunStatus } }>(
    `${brandBase(workspaceId, brandId)}/agents/research/runs`,
    { method: "POST", body: JSON.stringify({}) },
  );
}
