// Client-side contract for the RBAC API
// (docs/superpowers/specs/2026-10-21-rbac-api-contract.md). Keep in sync with the route handlers.
import { NetworkError, send, type SendInit } from "@/lib/net";
import { openPaywall, refusalOf } from "@/lib/paywall";
import { clearAllRecent } from "@/lib/recent";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The problem JSON's stable `code` (e.g. "story.expiredConfirm"), when it has one. */
    public code?: string,
    /** The parsed error body (or the streamed error line), for fields beyond message and code. */
    public data?: unknown,
  ) {
    super(message);
  }
}

export type Permission = { key: string; category: string; description: string; scope: RoleScope };

export type Role = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  scope: RoleScope;
  permissions: string[];
  memberCount: number;
};

/** WORKSPACE roles go on workspace members; PROJECT roles on one project (brand). */
export type RoleScope = "WORKSPACE" | "PROJECT";

export type MemberStatus = "ACTIVE" | "INVITED" | "DISABLED";

export type Member = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  status: MemberStatus;
  role: { id: string; name: string; slug: string };
  /** The workspace's creator (or whoever it was handed to): can't be changed or removed. */
  isPrimaryOwner: boolean;
  joinedAt: string;
};

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export type Invitation = {
  id: string;
  email: string;
  role: { id: string; name: string };
  project: string | null;
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
};

export type EmailDelivery = "sent" | "queued" | "not_configured";

export type PublicInvitation = {
  email: string;
  workspaceName: string;
  projectName: string | null;
  roleName: string;
  expiresAt: string;
  existingAccount: boolean;
};

export type RequestOptions = SendInit & {
  /**
   * Streamed (JSON-lines) answer: each progress line arrives here. send()'s AbortSignal.timeout keeps running while
   * the body is read, so a streamed call must pass a long `timeoutMs`; the 30 s default cuts a long answer off
   * as "The answer stopped partway".
   */
  onLine?: (line: unknown) => void;
};

/** A 402 carrying a paywall refusal opens the paywall; the caller still gets its error. */
function refuse(body: unknown) {
  const refusal = refusalOf(body);
  if (refusal) openPaywall(refusal);
}

/** Reads a JSON-lines answer: progress lines go to onLine, the closing line resolves or rejects the call. */
async function readLines<T>(body: ReadableStream<Uint8Array>, onLine?: (line: unknown) => void): Promise<T> {
  const lost = () => new ApiError(0, "The answer stopped partway. Try again.");
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (value) buffer += decoder.decode(value, { stream: !done });
      for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
        const text = buffer.slice(0, end).trim();
        buffer = buffer.slice(end + 1);
        if (!text) continue; // keep-alive
        const line = JSON.parse(text) as { type?: string; result?: T; status?: number; detail?: string; code?: string };
        if (line.type === "done") return line.result as T;
        // The line is the error's data, so a streamed 402 still carries planRequired and the code.
        if (line.type === "error") {
          if (line.status === 402) refuse(line);
          throw new ApiError(line.status ?? 500, line.detail ?? "Request failed", line.code, line);
        }
        onLine?.(line);
      }
      if (done) throw lost(); // ended before its last line
    }
  } catch (error) {
    // A dropped connection, a send() timeout during the read, or a garbled line: all a lost answer.
    throw error instanceof ApiError ? error : lost();
  }
}

// Errors are problem+json {type,title,status,detail?}; surface detail/title when present.
export async function request<T>(url: string, init: RequestOptions = {}): Promise<T> {
  const { onLine, headers: callerHeaders, ...rest } = init;
  const headers = new Headers();
  // Only a string body is JSON; FormData needs the browser to set its own multipart boundary.
  if (typeof rest.body === "string") headers.set("Content-Type", "application/json");
  if (onLine) headers.set("Accept", "application/x-ndjson");
  new Headers(callerHeaders).forEach((v, k) => headers.set(k, v));
  let res: Response;
  try {
    res = await send(url, { cache: "no-store", ...rest, headers });
  } catch (error) {
    // Offline, timed out, server unreachable: status 0, with a message that says which (lib/net.ts).
    if (error instanceof NetworkError) throw new ApiError(0, error.message);
    throw error;
  }
  if (res.status === 401 && url.startsWith("/api/")) redirectToLogin();
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    let data: unknown;
    try {
      const body = (await res.json()) as { detail?: string; title?: string; code?: string };
      message = body.detail || body.title || message;
      code = body.code;
      data = body;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    if (res.status === 402) refuse(data);
    throw new ApiError(res.status, message, code, data);
  }
  if (res.status === 204) return undefined as T;
  if (res.body && res.headers.get("content-type")?.includes("application/x-ndjson")) return readLines<T>(res.body, onLine);
  return (await res.json()) as T;
}

const PUBLIC_PAGES = ["/login", "/invite/", "/forgot-password", "/reset-password"];
let redirecting = false;

/** Session expired: go sign in, then come back here. Once per page; never from the public account pages. */
export function redirectToLogin() {
  if (typeof window === "undefined" || redirecting) return;
  const { pathname, search } = window.location;
  if (PUBLIC_PAGES.some((p) => pathname.startsWith(p))) return;
  redirecting = true;
  clearAllRecent(); // the next person on this browser must not see what this one opened
  window.location.assign(`/login?expired=1&next=${encodeURIComponent(pathname + search)}`);
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Try again.") {
  return err instanceof ApiError ? err.message : fallback;
}

const ws = (workspaceId: string) => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const settingsApi = {
  myPermissions: (w: string, b?: string | null) =>
    request<{ permissions: string[] }>(`${ws(w)}/my-permissions${b ? `?brandId=${encodeURIComponent(b)}` : ""}`),
  permissions: () => request<{ permissions: Permission[] }>("/api/v1/permissions"),

  roles: (w: string) => request<{ roles: Role[] }>(`${ws(w)}/roles`),
  createRole: (w: string, body: { name: string; description?: string; scope: RoleScope; permissions: string[] }) =>
    request<{ role: Role }>(`${ws(w)}/roles`, json("POST", body)),
  updateRole: (
    w: string,
    id: string,
    body: { name?: string; description?: string; permissions?: string[] },
  ) => request<{ role: Role }>(`${ws(w)}/roles/${encodeURIComponent(id)}`, json("PATCH", body)),
  deleteRole: (w: string, id: string) =>
    request<void>(`${ws(w)}/roles/${encodeURIComponent(id)}`, { method: "DELETE" }),

  members: (w: string) => request<{ members: Member[]; me: string }>(`${ws(w)}/members`),
  transferPrimaryOwner: (w: string, id: string) =>
    request<{ ok: true }>(`${ws(w)}/members/${encodeURIComponent(id)}/primary-owner`, { method: "POST" }),
  updateMember: (w: string, id: string, roleId: string) =>
    request<{ member: Member }>(`${ws(w)}/members/${encodeURIComponent(id)}`, json("PATCH", { roleId })),
  removeMember: (w: string, id: string) =>
    request<void>(`${ws(w)}/members/${encodeURIComponent(id)}`, { method: "DELETE" }),

  invitations: (w: string) => request<{ invitations: Invitation[] }>(`${ws(w)}/invitations`),
  invite: (w: string, body: { email: string; roleId: string }) =>
    request<{ invitation: Invitation; inviteUrl: string; emailDelivery: EmailDelivery }>(
      `${ws(w)}/invitations`,
      json("POST", body),
    ),
  revokeInvitation: (w: string, id: string) =>
    request<void>(`${ws(w)}/invitations/${encodeURIComponent(id)}`, { method: "DELETE" }),

  projectPeople: (w: string, b: string) => request<ProjectPeople>(`${brand(w, b)}/members`),
  addToProject: (w: string, b: string, body: { email: string; roleId: string }) =>
    request<{ invited: boolean; inviteUrl?: string; emailDelivery?: EmailDelivery }>(`${brand(w, b)}/members`, json("POST", body)),
  changeProjectRole: (w: string, b: string, grantId: string, roleId: string) =>
    request<{ ok: true }>(`${brand(w, b)}/members/${encodeURIComponent(grantId)}`, json("PATCH", { roleId })),
  removeFromProject: (w: string, b: string, grantId: string) =>
    request<void>(`${brand(w, b)}/members/${encodeURIComponent(grantId)}`, { method: "DELETE" }),
  revokeProjectInvitation: (w: string, b: string, id: string) =>
    request<void>(`${brand(w, b)}/invitations/${encodeURIComponent(id)}`, { method: "DELETE" }),

  connections: (w: string, b: string) =>
    request<{ providers: ProviderInfo[]; connections: Connection[] }>(connectionsUrl(w, b)),
  startConnect: (w: string, b: string, provider: Provider) =>
    request<{ url: string }>(`${brand(w, b)}/connections/start`, json("POST", { provider })),
  disconnect: (w: string, b: string, id: string) =>
    request<{ cancelled: number }>(`${brand(w, b)}/connections/${encodeURIComponent(id)}`, { method: "DELETE" }),
  connectShopify: (w: string, b: string, body: { shop: string; accessToken: string }) =>
    request<{ connection: Connection }>(`${brand(w, b)}/integrations/shopify`, json("POST", body)),
  /** Per-brand: `{ shop }` → AskCart's connect page to go to. Single-store (interim): no shop → the connection. */
  connectAskCart: (w: string, b: string, shop?: string) =>
    request<{ connection?: Connection; url?: string }>(`${brand(w, b)}/integrations/shopify/askcart`, json("POST", shop ? { shop } : {})),

  // Platform admins only (Platform admin → AI models); not per workspace.
  aiModels: () => request<AiModelSettings>("/api/v1/ai-models"),
  saveAiModel: (m: AiModel) => request<AiModelSettings>("/api/v1/ai-models", json("PUT", m)),
  deleteAiModel: (name: string) => request<AiModelSettings>(`/api/v1/ai-models/${encodeURIComponent(name)}`, { method: "DELETE" }),
  saveAiTier: (t: { tier: AiTierName; model: string; backup: string | null }) => request<AiModelSettings>("/api/v1/ai-tiers", json("PUT", t)),
};

export type AiTierName = "heavy" | "medium" | "light";
export type AiModel = {
  name: string;
  inputUsdPerM: number;
  cachedUsdPerM: number;
  outputUsdPerM: number;
  cacheBreakpoints: boolean;
  evalCandidate: boolean;
  judgeRank: 1 | 2 | null;
};
export type AiModelSettings = {
  models: (AiModel & { updatedAt: string; updatedBy: string | null })[];
  tiers: { tier: AiTierName; model: string | null; backup: string | null; updatedAt: string | null }[];
};

const brand = (w: string, b: string) => `${ws(w)}/brands/${encodeURIComponent(b)}`;
/** The brand's connected accounts: read by Settings and by the reel's Publish step. */
export const connectionsUrl = (w: string, b: string) => `${brand(w, b)}/connections`;

/** Emails (and invitations) come only to people who manage the project (project.members.manage). */
export type ProjectPeople = {
  viaWorkspace: { userId: string; name: string | null; email?: string; role: string }[];
  people: { id: string; userId: string; name: string | null; email?: string; role: { id: string; name: string } }[];
  invitations: { id: string; email: string; role: { id: string; name: string }; expiresAt: string }[];
  roles: { id: string; name: string; description: string | null }[];
};

export type Provider = "META" | "INSTAGRAM" | "THREADS" | "GOOGLE" | "GOOGLE_BUSINESS" | "REDDIT" | "PINTEREST" | "SHOPIFY" | "META_ADS";
/**
 * `kind`: "oauth" signs in on the platform; "token" (Shopify) takes a pasted Admin API token in a dialog.
 * `askCart` (Shopify only): how this platform reads a store through AskCart, with no token: "per-brand" (each brand
 * connects its own store on AskCart's page), "single-store" (interim: one store, one press), or null (not set up).
 */
export type ProviderInfo = {
  provider: Provider; label: string; configured: boolean; kind: "oauth" | "token"; askCart?: "per-brand" | "single-store" | null;
};
export type Connection = {
  id: string;
  provider: Provider;
  displayName: string;
  status: "ACTIVE" | "ERROR" | "REVOKED";
  lastError: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string;
};

export const authApi = {
  invitation: (token: string) =>
    request<PublicInvitation>(`/api/v1/auth/invitations/${encodeURIComponent(token)}`),
  accept: (body: { token: string; name?: string; password?: string }) =>
    request<{ ok: true }>("/api/v1/auth/invitations/accept", json("POST", body)),
  forgot: (email: string) => request<{ ok: true; emailConfigured?: false }>("/api/v1/auth/password/forgot", json("POST", { email })),
  reset: (token: string, password: string) =>
    request<{ ok: true }>("/api/v1/auth/password/reset", json("POST", { token, password })),
};
