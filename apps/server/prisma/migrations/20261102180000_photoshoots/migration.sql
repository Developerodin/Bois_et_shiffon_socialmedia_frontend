-- Photoshoots (mobile "04 Photoshoot"): four generated shots of one brand photo, on a priced tier.
CREATE TABLE "PhotoShoot" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "input" JSONB NOT NULL,
    "requests" TEXT[],
    "outputKeys" TEXT[],
    "credits" INTEGER NOT NULL,
    "chargeId" TEXT NOT NULL,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotoShoot_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PhotoShoot_brandId_createdAt_idx" ON "PhotoShoot"("brandId", "createdAt");

ALTER TABLE "PhotoShoot" ADD CONSTRAINT "PhotoShoot_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE CASCADE ON UPDATE CASCADE;
