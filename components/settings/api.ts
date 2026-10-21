// Client-side contract for the RBAC API
// (docs/superpowers/specs/2026-10-21-rbac-api-contract.md). Keep in sync with the route handlers.
import { ApiError } from "@/components/agents/api";

export { ApiError };

export type Permission = { key: string; category: string; description: string };

export type Role = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  memberCount: number;
};

export type MemberStatus = "ACTIVE" | "INVITED" | "DISABLED";

export type Member = {
  id: string;
  userId: string;
  name: string | null;
  email: string;
  status: MemberStatus;
  role: { id: string; name: string; slug: string };
  joinedAt: string;
};

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export type Invitation = {
  id: string;
  email: string;
  role: { id: string; name: string };
  status: InvitationStatus;
  expiresAt: string;
  createdAt: string;
  invitedBy: string | null;
};

export type EmailDelivery = "sent" | "queued" | "not_configured";

export type PublicInvitation = {
  email: string;
  workspaceName: string;
  roleName: string;
  expiresAt: string;
  existingAccount: boolean;
};

// Errors are problem+json {type,title,status,detail?}; surface detail/title when present.
export async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = init?.body ? { "Content-Type": "application/json" } : undefined;
  const res = await fetch(url, { cache: "no-store", headers, ...init });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = (await res.json()) as { detail?: string; title?: string };
      message = body.detail || body.title || message;
    } catch {
      // Non-JSON error body; keep the generic message.
    }
    throw new ApiError(res.status, message);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Try again.") {
  return err instanceof ApiError ? err.message : fallback;
}

const ws = (workspaceId: string) => `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const settingsApi = {
  myPermissions: (w: string) => request<{ permissions: string[] }>(`${ws(w)}/my-permissions`),
  permissions: () => request<{ permissions: Permission[] }>("/api/v1/permissions"),

  roles: (w: string) => request<{ roles: Role[] }>(`${ws(w)}/roles`),
  createRole: (w: string, body: { name: string; description?: string; permissions: string[] }) =>
    request<{ role: Role }>(`${ws(w)}/roles`, json("POST", body)),
  updateRole: (
    w: string,
    id: string,
    body: { name?: string; description?: string; permissions?: string[] },
  ) => request<{ role: Role }>(`${ws(w)}/roles/${encodeURIComponent(id)}`, json("PATCH", body)),
  deleteRole: (w: string, id: string) =>
    request<void>(`${ws(w)}/roles/${encodeURIComponent(id)}`, { method: "DELETE" }),

  members: (w: string) => request<{ members: Member[] }>(`${ws(w)}/members`),
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
};

export const authApi = {
  invitation: (token: string) =>
    request<PublicInvitation>(`/api/v1/auth/invitations/${encodeURIComponent(token)}`),
  accept: (body: { token: string; name?: string; password?: string }) =>
    request<{ ok: true }>("/api/v1/auth/invitations/accept", json("POST", body)),
  forgot: (email: string) => request<{ ok: true }>("/api/v1/auth/password/forgot", json("POST", { email })),
  reset: (token: string, password: string) =>
    request<{ ok: true }>("/api/v1/auth/password/reset", json("POST", { token, password })),
};
