-- Primary owner: the workspace's creator. Can't be demoted or removed; only they can hand it over.

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "ownerUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Existing workspaces: the earliest Owner member is taken as the creator.
UPDATE "Workspace" w SET "ownerUserId" = (
  SELECT m."userId" FROM "WorkspaceMember" m JOIN "Role" r ON r."id" = m."roleId"
  WHERE m."workspaceId" = w."id" AND r."slug" = 'owner'
  ORDER BY m."createdAt" ASC, m."id" ASC LIMIT 1
);
