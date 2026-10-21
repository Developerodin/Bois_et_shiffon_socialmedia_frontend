# RBAC + account API contract (2026-10-21)

Ported from Cad IAM (minus impersonation). Errors are problem+json `{type,title,status,detail?}`.
All workspace routes require a session and the listed permission; 401 no session, 403 missing permission.

## Permission catalog
`GET /api/v1/permissions` → `{ permissions: Array<{ key, category, description }> }` (any signed-in user)

Keys: `workspace.manage`, `members.read`, `members.manage`, `invitations.manage`, `roles.read`, `roles.manage`, `audit.read`, `brand.create`, `brand.read`, `brand.archive`, `agents.read`, `agents.run`, `context.edit`, `context.confirm`, `rules.approve`, `content.create`, `content.approve`, `publish.execute`, `integrations.manage`, `analytics.read`.

## Roles
- `GET /api/v1/workspaces/:ws/roles` (roles.read) → `{ roles: Array<{ id, slug, name, description: string|null, isSystem: boolean, permissions: string[], memberCount: number }> }`
- `POST /api/v1/workspaces/:ws/roles` (roles.manage) body `{ name, description?, permissions: string[] }` → 201 `{ role }`
- `PATCH /api/v1/workspaces/:ws/roles/:roleId` (roles.manage) body `{ name?, description?, permissions? }` → `{ role }` — 409 for system roles
- `DELETE /api/v1/workspaces/:ws/roles/:roleId` (roles.manage) → 204 — 409 if system role or assigned to members

System roles (seeded per workspace, read-only): `owner`, `admin`, `social-manager`, `editor`, `approver`, `commercial-owner`, `viewer`.

## Members
- `GET /api/v1/workspaces/:ws/members` (members.read) → `{ members: Array<{ id, userId, name: string|null, email, status: "ACTIVE"|"INVITED"|"DISABLED", role: { id, name, slug }, joinedAt }> }`
- `PATCH /api/v1/workspaces/:ws/members/:memberId` (members.manage) body `{ roleId }` → `{ member }` — 409 if it would leave no owner
- `DELETE /api/v1/workspaces/:ws/members/:memberId` (members.manage) → 204 — 409 if last owner; removing yourself allowed unless last owner

## Invitations
- `GET /api/v1/workspaces/:ws/invitations` (invitations.manage) → `{ invitations: Array<{ id, email, role: { id, name }, status: "PENDING"|"ACCEPTED"|"REVOKED"|"EXPIRED", expiresAt, createdAt, invitedBy: string|null }> }`
- `POST /api/v1/workspaces/:ws/invitations` (invitations.manage) body `{ email, roleId }` → 201 `{ invitation, inviteUrl, emailDelivery: "sent"|"queued"|"not_configured" }` (inviteUrl shown to the admin so it can be shared when email isn't configured)
- `DELETE /api/v1/workspaces/:ws/invitations/:id` (invitations.manage) → 204 (revoke)

## Public (no session)
- `GET /api/v1/auth/invitations/:token` → `{ email, workspaceName, roleName, expiresAt, existingAccount: boolean }` — 404 invalid/expired/used
- `POST /api/v1/auth/invitations/accept` body `{ token, name?, password? }` (password ≥ 12 chars required when no existing account) → `{ ok: true }` then the UI sends the user to `/login`
- `POST /api/v1/auth/password/forgot` body `{ email }` → always 202 `{ ok: true }` (no account enumeration); 429 when rate-limited
- `POST /api/v1/auth/password/reset` body `{ token, password }` (≥ 12 chars) → `{ ok: true }` — 400 invalid/expired token; signs the user out everywhere

## Pages
`/settings` (tabs Members / Roles / Invitations), `/invite/[token]`, `/forgot-password`, `/reset-password?token=…`; `/login` gets a "Forgot password?" link. Public pages are allowed by middleware.

## Shell permissions for UI
`GET /api/v1/workspaces/:ws/my-permissions` → `{ permissions: string[] }` (for hiding admin actions; server still enforces).
