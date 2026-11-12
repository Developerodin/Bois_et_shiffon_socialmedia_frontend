-- Paid Higgsfield assets for reels (mobile R12 template previews, later R10 presenters).
CREATE TABLE "ReelAsset" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "requestId" TEXT,
    "outputKey" TEXT,
    "chargeId" TEXT NOT NULL,
    "error" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReelAsset_brandId_kind_createdAt_idx" ON "ReelAsset"("brandId", "kind", "createdAt");

ALTER TABLE "ReelAsset" ADD CONSTRAINT "ReelAsset_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One asset being made per brand, kind and template, so two taps can't both charge (not expressible in Prisma).
CREATE UNIQUE INDEX "ReelAsset_one_running" ON "ReelAsset"("brandId", "kind", (COALESCE("input"->>'templateId', ''))) WHERE "status" = 'RUNNING';
