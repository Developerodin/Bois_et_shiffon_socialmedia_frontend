/**
 * Permission catalog — single source of truth for permission keys (ported from
 * Cad `permissions.catalog.ts`). Keys are `resource.action`. Roles store keys.
 */
export const PERMISSIONS = [
  ["workspace.manage", "workspace", "Rename the workspace, manage billing and ownership"],
  ["members.read", "members", "See workspace members and their roles"],
  ["members.manage", "members", "Change member roles and remove members"],
  ["invitations.manage", "members", "Invite people and revoke invitations"],
  ["roles.read", "roles", "See roles and their permissions"],
  ["roles.manage", "roles", "Create, edit and delete custom roles"],
  ["audit.read", "audit", "Read the audit log"],
  ["brand.create", "brands", "Create brands"],
  ["brand.read", "brands", "Open a brand and its workspace areas"],
  ["brand.archive", "brands", "Archive and restore brands"],
  ["agents.read", "agents", "See agents and the Agent Log"],
  ["agents.run", "agents", "Run agents and change their schedules"],
  ["context.edit", "context", "Edit brand strategy documents"],
  ["context.confirm", "context", "Confirm strategy documents as brand truth"],
  ["rules.approve", "context", "Approve brand rules and product claims"],
  ["content.create", "content", "Create and edit briefs and drafts"],
  ["content.approve", "content", "Approve content for publishing (never your own)"],
  ["publish.execute", "publishing", "Publish or schedule approved content"],
  ["integrations.manage", "publishing", "Connect and disconnect channel accounts"],
  ["analytics.read", "analytics", "See performance, learning notes and reports"],
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number][0];
export const PERMISSION_KEYS = PERMISSIONS.map(([key]) => key) as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
  return (PERMISSION_KEYS as string[]).includes(key);
}

const ALL = PERMISSION_KEYS;
const READ: PermissionKey[] = ["brand.read", "agents.read", "analytics.read"];

/** Seeded per workspace; read-only in the UI. Mirrors the brief's duties. */
export const SYSTEM_ROLES: ReadonlyArray<{
  slug: string;
  name: string;
  description: string;
  permissions: PermissionKey[];
}> = [
  { slug: "owner", name: "Owner", description: "Full control, including ownership and billing", permissions: ALL },
  { slug: "admin", name: "Admin", description: "Everything except workspace ownership", permissions: ALL.filter((p) => p !== "workspace.manage") },
  {
    slug: "social-manager",
    name: "Social media manager",
    description: "Runs opportunities, agents and the calendar",
    permissions: [...READ, "members.read", "roles.read", "agents.run", "context.edit", "context.confirm", "content.create", "publish.execute"],
  },
  { slug: "editor", name: "Designer / editor", description: "Receives briefs and produces drafts", permissions: [...READ, "content.create"] },
  {
    slug: "approver",
    name: "Brand approver",
    description: "Reviews final content and brand rules",
    permissions: [...READ, "context.edit", "context.confirm", "rules.approve", "content.approve"],
  },
  { slug: "commercial-owner", name: "Commercial owner", description: "Sets product priorities, campaigns and offer rules", permissions: [...READ, "rules.approve"] },
  { slug: "viewer", name: "Viewer", description: "Read-only access", permissions: READ },
];

/** Legacy WorkspaceRole enum → system role slug (fallback while roleId is null). */
export const LEGACY_ROLE_SLUG = {
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "social-manager",
  REVIEWER: "approver",
  VIEWER: "viewer",
} as const;
