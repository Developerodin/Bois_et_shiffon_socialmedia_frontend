/** Every permission key, its group and what it allows: the catalog the server enforces and the admin console lists. */
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
  ["voices.manage", "voices", "Clone voices for the workspace, and rename or delete them"],
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
  ["content.download", "content", "Download post packages and exports"],
  ["publish.execute", "publishing", "Publish or schedule approved content"],
  ["integrations.manage", "publishing", "Connect and disconnect channel accounts"],
  ["inbox.read", "customers", "Read customer messages and reviews"],
  ["analytics.read", "analytics", "See performance, learning notes and reports"],
  ["commercial.manage", "commercial", "Set product priorities, campaigns and offers"],
  ["tasks.read", "tasks", "See tasks and projects, and comment"],
  ["tasks.manage", "tasks", "Create, edit, assign and cancel tasks and projects"],
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number][0];

/**
 * Reading a business's connected accounts: people who answer customers, publish (they pick the account) or manage
 * the accounts. Any one of these is enough; a client reviewer holds none.
 */
export const CONNECTIONS_READ = ["inbox.read", "publish.execute", "integrations.manage"] as const satisfies readonly PermissionKey[];
