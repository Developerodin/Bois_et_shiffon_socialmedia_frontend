-- Project-level access: roles are WORKSPACE (owner/admin/member) or PROJECT (per brand),
-- a BrandMember holds one project role, and an invitation can target one project.

-- Members on a workspace role that is about to become a project role (or be retired) would
-- silently change access. None exist today; stop the deploy if that changes.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "WorkspaceMember" m JOIN "Role" r ON r."id" = m."roleId"
    WHERE r."isSystem" AND r."slug" NOT IN ('owner', 'admin')
  ) OR EXISTS (
    SELECT 1 FROM "Invitation" i JOIN "Role" r ON r."id" = i."roleId"
    WHERE r."isSystem" AND r."slug" NOT IN ('owner', 'admin') AND i."acceptedAt" IS NULL AND i."revokedAt" IS NULL
  ) OR EXISTS (SELECT 1 FROM "WorkspaceMember" WHERE "roleId" IS NULL AND "role" NOT IN ('OWNER', 'ADMIN'))
    OR EXISTS (SELECT 1 FROM "BrandMember") THEN
    RAISE EXCEPTION 'Move members off non-owner/admin system roles (and clear BrandMember) before this migration';
  END IF;
END $$;

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('WORKSPACE', 'PROJECT');

-- AlterTable
ALTER TABLE "BrandMember" DROP COLUMN "role",
DROP COLUMN "roleIds",
ADD COLUMN     "roleId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "brandId" TEXT;

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "scope" "RoleScope" NOT NULL DEFAULT 'WORKSPACE';

-- AddForeignKey
ALTER TABLE "BrandMember" ADD CONSTRAINT "BrandMember_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Retired system roles (old invitations on them are already accepted/revoked; drop those rows' role link by deleting them).
DELETE FROM "Invitation" i USING "Role" r
WHERE r."id" = i."roleId" AND r."isSystem" AND r."slug" IN ('social-manager', 'editor', 'commercial-owner');
DELETE FROM "Role" WHERE "isSystem" AND "slug" IN ('social-manager', 'editor', 'commercial-owner');

-- System roles for every existing workspace (snapshot of SYSTEM_ROLES in permissions.catalog.ts).
INSERT INTO "Role" ("id", "workspaceId", "slug", "name", "description", "isSystem", "scope", "permissions", "createdAt", "updatedAt")
SELECT 'r' || md5(random()::text || w."id" || v.slug), w."id", v.slug, v.name, v.description, true, v.scope, v.permissions, now(), now()
FROM "Workspace" w CROSS JOIN (VALUES
  ('owner', 'Owner', 'Full control of the workspace and every project, including ownership and billing', 'WORKSPACE'::"RoleScope", ARRAY['workspace.manage', 'members.read', 'members.manage', 'invitations.manage', 'roles.read', 'roles.manage', 'audit.read', 'brand.create', 'brand.archive', 'brand.read', 'project.members.manage', 'agents.read', 'agents.run', 'context.edit', 'context.confirm', 'rules.approve', 'content.create', 'content.approve', 'publish.execute', 'integrations.manage', 'analytics.read']::TEXT[]),
  ('admin', 'Admin', 'Manages people, roles and every project; not ownership', 'WORKSPACE'::"RoleScope", ARRAY['members.read', 'members.manage', 'invitations.manage', 'roles.read', 'roles.manage', 'audit.read', 'brand.create', 'brand.archive', 'brand.read', 'project.members.manage', 'agents.read', 'agents.run', 'context.edit', 'context.confirm', 'rules.approve', 'content.create', 'content.approve', 'publish.execute', 'integrations.manage', 'analytics.read']::TEXT[]),
  ('member', 'Member', 'Sees only the projects they are invited to', 'WORKSPACE'::"RoleScope", ARRAY[]::TEXT[]),
  ('project-admin', 'Project admin', 'Everything on this project, including who works on it', 'PROJECT'::"RoleScope", ARRAY['brand.read', 'project.members.manage', 'agents.read', 'agents.run', 'context.edit', 'context.confirm', 'rules.approve', 'content.create', 'content.approve', 'publish.execute', 'integrations.manage', 'analytics.read']::TEXT[]),
  ('manager', 'Manager', 'Runs agents, strategy, the calendar and publishing', 'PROJECT'::"RoleScope", ARRAY['brand.read', 'agents.read', 'analytics.read', 'agents.run', 'context.edit', 'context.confirm', 'content.create', 'publish.execute', 'integrations.manage']::TEXT[]),
  ('creator', 'Creator', 'Writes and edits drafts', 'PROJECT'::"RoleScope", ARRAY['brand.read', 'agents.read', 'analytics.read', 'content.create']::TEXT[]),
  ('approver', 'Approver', 'Reviews posts, brand rules and strategy', 'PROJECT'::"RoleScope", ARRAY['brand.read', 'agents.read', 'analytics.read', 'context.edit', 'context.confirm', 'rules.approve', 'content.approve']::TEXT[]),
  ('viewer', 'Viewer', 'Read-only access to this project', 'PROJECT'::"RoleScope", ARRAY['brand.read', 'agents.read', 'analytics.read']::TEXT[])
) AS v(slug, name, description, scope, permissions)
ON CONFLICT ("workspaceId", "slug") DO UPDATE SET
  "name" = EXCLUDED."name", "description" = EXCLUDED."description", "isSystem" = true,
  "scope" = EXCLUDED."scope", "permissions" = EXCLUDED."permissions", "updatedAt" = now();
