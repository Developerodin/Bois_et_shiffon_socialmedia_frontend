-- AlterEnum
ALTER TYPE "ContentChannel" ADD VALUE 'INSTAGRAM_STORY';

-- AlterEnum
ALTER TYPE "PublicationStatus" ADD VALUE 'PARTIAL';

-- AlterTable
ALTER TABLE "ContentItem" ADD COLUMN     "byHand" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "MediaUpload" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "bytes" INTEGER NOT NULL,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "hasAudio" BOOLEAN,
    "productId" TEXT,
    "rightsConfirmedBy" TEXT,
    "rightsConfirmedAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MediaUpload_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaUpload_key_key" ON "MediaUpload"("key");

-- CreateIndex
CREATE INDEX "MediaUpload_workspaceId_brandId_status_createdAt_idx" ON "MediaUpload"("workspaceId", "brandId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MediaUpload_brandId_productId_key" ON "MediaUpload"("brandId", "productId");
