import type { PlanResult } from "@/shared";
import { request } from "@/components/settings/api";
import { SLOW_MS } from "@/lib/net";

const enc = encodeURIComponent;

const brand = (w: string, b: string) => `/api/v1/workspaces/${enc(w)}/brands/${enc(b)}`;
export const reelsUrl = (w: string, b: string) => `${brand(w, b)}/reels`;
export const reelUrl = (w: string, b: string, id: string) => `${reelsUrl(w, b)}/${enc(id)}`;
export const reelOptionsUrl = (w: string, b: string) => `${reelsUrl(w, b)}/options`;
export const opportunitiesUrl = (w: string, b: string) => `${brand(w, b)}/opportunities`;

// Both calls stream NDJSON (onLine set): progress lines go to onLine, the last line is the result or the error.
// The same requestId again returns the earlier answer instead of writing a second plan.
export const reelsApi = {
  create: (w: string, b: string, body: { prompt?: string; opportunityId?: string; templateId?: string }, requestId: string, onLine: (l: unknown) => void): Promise<PlanResult & { id: string }> =>
    request<PlanResult & { id: string }>(reelsUrl(w, b), { method: "POST", body: JSON.stringify({ ...body, language: "en", requestId }), timeoutMs: SLOW_MS, onLine }),
  chat: (w: string, b: string, id: string, body: { version: number; message?: string; templateId?: string }, requestId: string, onLine: (l: unknown) => void): Promise<PlanResult> =>
    request<PlanResult>(`${reelUrl(w, b, id)}/plan`, { method: "POST", body: JSON.stringify({ ...body, language: "en", requestId }), timeoutMs: SLOW_MS, onLine }),
};
