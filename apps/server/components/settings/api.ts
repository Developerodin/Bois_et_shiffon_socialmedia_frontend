// Client-side contract for the RBAC API
// (docs/superpowers/specs/2026-10-21-rbac-api-contract.md). Keep in sync with the route handlers.
import { NetworkError, send } from "@/lib/net";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The problem JSON's stable `code` (e.g. "story.expiredConfirm"), when it has one. */
    public code?: string,
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

// Errors are problem+json {type,title,status,detail?}; surface detail/title when present.
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = init?.body ? { "Content-Type": "application/json" } : undefined;
  let res: Response;
  try {
    res = await send(url, { cache: "no-store", headers, ...init });
  } catch (error) {
    // Offline, timed out, server unreachable: status 0, with a message that says which (lib/net.ts).
    if (error instanceof NetworkError) throw new ApiError(0, error.message);
    throw error;
  }
  if (res.status === 401 && url.startsWith("/api/")) redirectToLogin();
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const body = (await res.json()) as { detail?: string; title?: string; code?: string };
      message = body.detail || body.title || message;
      code = body.code;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(res.status, message, code);
  }
  if (res.status === 204) return undefined as T;
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
    request<{ providers: ProviderInfo[]; connections: Connection[] }>(`${brand(w, b)}/connections`),
  startConnect: (w: string, b: string, provider: Provider) =>
    request<{ url: string }>(`${brand(w, b)}/connections/start`, json("POST", { provider })),
  disconnect: (w: string, b: string, id: string) =>
    request<{ cancelled: number }>(`${brand(w, b)}/connections/${encodeURIComponent(id)}`, { method: "DELETE" }),
  connectShopify: (w: string, b: string, body: { shop: string; accessToken: string }) =>
    request<{ connection: Connection }>(`${brand(w, b)}/integrations/shopify`, json("POST", body)),

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

export type ProjectPeople = {
  viaWorkspace: { userId: string; name: string | null; email: string; role: string }[];
  people: { id: string; userId: string; name: string | null; email: string; role: { id: string; name: string } }[];
  invitations: { id: string; email: string; role: { id: string; name: string }; expiresAt: string }[];
  roles: { id: string; name: string; description: string | null }[];
};

export type Provider = "META" | "INSTAGRAM" | "THREADS" | "GOOGLE" | "GOOGLE_BUSINESS" | "REDDIT" | "PINTEREST" | "SHOPIFY";
/** `kind`: "oauth" signs in on the platform; "token" (Shopify) takes a pasted Admin API token in a dialog. */
export type ProviderInfo = { provider: Provider; label: string; configured: boolean; kind: "oauth" | "token" };
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
