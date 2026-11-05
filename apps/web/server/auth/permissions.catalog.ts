/**
 * Permission catalog — single source of truth for permission keys (ported from
 * Cad `permissions.catalog.ts`). Keys are `resource.action`. Roles store keys.
 */
export const PERMISSIONS = [
  // Workspace scope: held through the workspace role.
  ["workspace.manage", "workspace", "Rename the workspace, manage billing and ownership"],
  ["members.read", "members", "See workspace members and their roles"],
  ["members.manage", "members", "Change member roles and remove members"],
  ["invitations.manage", "members", "Invite people to the workspace and revoke invitations"],
  ["roles.read", "roles", "See roles and their permissions"],
  ["roles.manage", "roles", "Create, edit and delete custom roles"],
  ["audit.read", "audit", "Read the audit log"],
  ["brand.create", "brands", "Create projects (brands)"],
  ["brand.archive", "brands", "Archive and restore projects"],
  // Project scope: a workspace role holding these gets them on every project;
  // a project role gets them on its one project.
  ["brand.read", "project", "Open the project and its workspace areas"],
  ["project.members.manage", "project", "Invite people to this project and change their project roles"],
  ["agents.read", "agents", "See agents and the Agent Log"],
  ["agents.run", "agents", "Run agents and change their schedules"],
  ["context.edit", "context", "Edit brand strategy documents"],
  ["context.confirm", "context", "Confirm strategy documents as brand truth"],
  ["rules.approve", "context", "Approve brand rules and product claims"],
  ["content.create", "content", "Create and edit briefs and drafts"],
  ["content.approve", "content", "Approve content for publishing (your own only when nobody else can approve)"],
  ["publish.execute", "publishing", "Publish or schedule approved content"],
  ["integrations.manage", "publishing", "Connect and disconnect channel accounts"],
  ["analytics.read", "analytics", "See performance, learning notes and reports"],
  ["commercial.manage", "commercial", "Set product priorities, campaigns and offers"],
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number][0];
export const PERMISSION_KEYS = PERMISSIONS.map(([key]) => key) as PermissionKey[];

export function isPermissionKey(key: string): key is PermissionKey {
  return (PERMISSION_KEYS as string[]).includes(key);
}

const ALL = PERMISSION_KEYS;
const WORKSPACE_ONLY: PermissionKey[] = [
  "workspace.manage", "members.read", "members.manage", "invitations.manage",
  "roles.read", "roles.manage", "audit.read", "brand.create", "brand.archive",
];
export const PROJECT_KEYS = ALL.filter((k) => !WORKSPACE_ONLY.includes(k));
export const permissionScope = (k: PermissionKey) => (WORKSPACE_ONLY.includes(k) ? "WORKSPACE" : "PROJECT");
const READ: PermissionKey[] = ["brand.read", "agents.read", "analytics.read"];

/**
 * Seeded per workspace; read-only in the UI. Workspace roles decide who runs the workspace;
 * project roles decide what someone does on one project (brand).
 */
export const SYSTEM_ROLES: ReadonlyArray<{
  slug: string;
  name: string;
  description: string;
  scope: "WORKSPACE" | "PROJECT";
  permissions: PermissionKey[];
}> = [
  { slug: "owner", name: "Owner", scope: "WORKSPACE", description: "Full control of the workspace and every project, including ownership and billing", permissions: ALL },
  { slug: "admin", name: "Admin", scope: "WORKSPACE", description: "Manages people, roles and every project; not ownership", permissions: ALL.filter((p) => p !== "workspace.manage") },
  { slug: "member", name: "Member", scope: "WORKSPACE", description: "Sees only the projects they are invited to", permissions: [] },

  { slug: "project-admin", name: "Project admin", scope: "PROJECT", description: "Everything on this project, including who works on it", permissions: PROJECT_KEYS },
  {
    slug: "manager",
    name: "Manager",
    scope: "PROJECT",
    description: "Runs agents, strategy, the calendar and publishing",
    permissions: [...READ, "agents.run", "context.edit", "context.confirm", "content.create", "publish.execute", "integrations.manage"],
  },
  { slug: "creator", name: "Creator", scope: "PROJECT", description: "Writes and edits drafts", permissions: [...READ, "content.create"] },
  {
    slug: "approver",
    name: "Approver",
    scope: "PROJECT",
    description: "Reviews posts, brand rules and strategy",
    permissions: [...READ, "context.edit", "context.confirm", "rules.approve", "content.approve"],
  },
  {
    slug: "commercial-owner",
    name: "Commercial owner",
    scope: "PROJECT",
    description: "Sets product priorities, campaigns and offers",
    permissions: [...READ, "commercial.manage"],
  },
  { slug: "viewer", name: "Viewer", scope: "PROJECT", description: "Read-only access to this project", permissions: READ },
];

/** Legacy WorkspaceRole enum → system role slug (fallback while roleId is null). */
export const LEGACY_ROLE_SLUG = {
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "member",
  REVIEWER: "member",
  VIEWER: "member",
} as const;
