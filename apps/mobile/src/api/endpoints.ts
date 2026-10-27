import { api, session } from "@/api/client";

/** Typed calls the screens use. Shapes mirror apps/web route responses. */

export type Me = { user: { id: string; email: string; name: string | null }; workspaces: { id: string; name: string; role: string }[] };
export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type AgentEvent = { id: string; runId: string; agentKey: string; createdAt: string; level: "INFO" | "SUCCESS" | "WARN" | "ERROR"; message: string };
export type ContextDocs = {
  docs: { kind: string; title: string; latest: { markdown: string; createdAt: string; status: string } | null }[];
  research: { runId: string; status: RunStatus; error?: string | null } | null;
};

const brandBase = (ws: string, brandId: string) => `/workspaces/${encodeURIComponent(ws)}/brands/${encodeURIComponent(brandId)}`;

export const auth = {
  sendCode: (email: string) => api<{ ok: true }>("/mobile/code", { body: { email } }),
  /** phoneTicket links a just-verified mobile number to this email's account (phone sign-up). */
  async verify(email: string, code: string, phoneTicket?: string) {
    const r = await api<{ token: string; user: Me["user"] }>("/mobile/session", { body: { email, code, phoneTicket } });
    await session.save(r.token);
    return r.user;
  },
  sendPhoneCode: (phone: string) => api<{ ok: true }>("/mobile/phone/code", { body: { phone } }),
  /** A known number signs in; a new one returns a ticket and the app asks for an email next. */
  async verifyPhone(phone: string, code: string): Promise<{ phoneTicket: string } | null> {
    const r = await api<{ token: string } | { needsEmail: true; phoneTicket: string }>("/mobile/phone/session", { body: { phone, code } });
    if ("phoneTicket" in r) return { phoneTicket: r.phoneTicket };
    await session.save(r.token);
    return null;
  },
  async google(idToken: string) {
    const r = await api<{ token: string; user: Me["user"] }>("/mobile/google", { body: { idToken } });
    await session.save(r.token);
    return r.user;
  },
};

export const me = () => api<Me>("/me");

/** Creates the brand; the server starts Research, SEO and GEO for it. */
export const createBrand = (workspaceId: string, input: { displayName: string; websiteUrl: string }) =>
  api<{ brand: { id: string; displayName: string }; researchRunId: string }>(`/workspaces/${encodeURIComponent(workspaceId)}/brands`, { body: input, workspaceId });

export const contextDocs = (ws: string, brandId: string, signal?: AbortSignal) => api<ContextDocs>(`${brandBase(ws, brandId)}/context-docs`, { workspaceId: ws, signal });

export const agentEvents = (ws: string, brandId: string, after: string | null, signal?: AbortSignal) =>
  api<{ events: AgentEvent[] }>(`${brandBase(ws, brandId)}/agent-events?limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`, { workspaceId: ws, signal });
