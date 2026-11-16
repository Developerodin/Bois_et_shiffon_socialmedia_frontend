-- CreateEnum
CREATE TYPE "ReelRenderStep" AS ENUM ('VOICE', 'CLIPS', 'STITCH', 'STORE', 'DONE', 'FAILED');

-- AlterTable
ALTER TABLE "ContentItem" ADD COLUMN     "postUrl" TEXT,
ADD COLUMN     "studio" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ReelRender" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "step" "ReelRenderStep" NOT NULL DEFAULT 'VOICE',
    "claimedAt" TIMESTAMP(3),
    "requests" JSONB NOT NULL DEFAULT '{}',
    "outputs" JSONB NOT NULL DEFAULT '{}',
    "ticks" INTEGER NOT NULL DEFAULT 0,
    "chargeId" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "videoKey" TEXT,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReelRender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReelRender_contentItemId_createdAt_idx" ON "ReelRender"("contentItemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReelRender_contentVersionId_attempt_key" ON "ReelRender"("contentVersionId", "attempt");

-- AddForeignKey
ALTER TABLE "ReelRender" ADD CONSTRAINT "ReelRender_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

