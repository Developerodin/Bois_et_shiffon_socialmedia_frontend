-- Campaigns, offers and standing priorities set by the commercial owner (brief A7, B2, B6, B7).
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "offer" TEXT,
    "discountPercent" INTEGER,
    "code" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Campaign_brandId_endsAt_idx" ON "Campaign"("brandId", "endsAt");

ALTER TABLE "Campaign" ADD CONSTRAINT "Campaign_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- The campaign a post was planned for; set at planning, never changed after.
ALTER TABLE "ContentItem" ADD COLUMN "campaignId" TEXT;

CREATE INDEX "ContentItem_campaignId_idx" ON "ContentItem"("campaignId");

ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The brand's IANA timezone: campaign times are wall-clock times in it.
ALTER TABLE "BrandProfile" ADD COLUMN "timeZone" TEXT;

-- New key for the system roles that hold every project key (snapshot of SYSTEM_ROLES in permissions.catalog.ts).
UPDATE "Role" SET "permissions" = array_append("permissions", 'commercial.manage'), "updatedAt" = now()
WHERE "isSystem" AND "slug" IN ('owner', 'admin', 'project-admin') AND NOT ('commercial.manage' = ANY("permissions"));

-- The "Commercial owner" project role for every existing workspace.
INSERT INTO "Role" ("id", "workspaceId", "slug", "name", "description", "isSystem", "scope", "permissions", "createdAt", "updatedAt")
SELECT 'r' || md5(random()::text || w."id" || 'commercial-owner'), w."id", 'commercial-owner', 'Commercial owner',
  'Sets product priorities, campaigns and offers', true, 'PROJECT'::"RoleScope",
  ARRAY['brand.read', 'agents.read', 'analytics.read', 'commercial.manage']::TEXT[], now(), now()
FROM "Workspace" w
ON CONFLICT ("workspaceId", "slug") DO UPDATE SET
  "name" = EXCLUDED."name", "description" = EXCLUDED."description", "isSystem" = true,
  "scope" = EXCLUDED."scope", "permissions" = EXCLUDED."permissions", "updatedAt" = now();
