-- CreateEnum
CREATE TYPE "ApprovalVerdict" AS ENUM ('APPROVED', 'CHANGES_REQUESTED', 'REJECTED');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED', 'PENDING_VERIFY', 'CANCELLED');

-- CreateTable
CREATE TABLE "ApprovalDecision" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "packageHash" TEXT NOT NULL,
    "verdict" "ApprovalVerdict" NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApprovalDecision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublicationAttempt" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "packageHash" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "target" JSONB NOT NULL,
    "status" "PublicationStatus" NOT NULL DEFAULT 'SCHEDULED',
    "runAt" TIMESTAMP(3) NOT NULL,
    "externalId" TEXT,
    "externalUrl" TEXT,
    "error" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApprovalDecision_contentItemId_createdAt_idx" ON "ApprovalDecision"("contentItemId", "createdAt");

-- CreateIndex
CREATE INDEX "PublicationAttempt_contentItemId_createdAt_idx" ON "PublicationAttempt"("contentItemId", "createdAt");

-- CreateIndex
CREATE INDEX "PublicationAttempt_status_runAt_idx" ON "PublicationAttempt"("status", "runAt");

-- AddForeignKey
ALTER TABLE "ApprovalDecision" ADD CONSTRAINT "ApprovalDecision_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublicationAttempt" ADD CONSTRAINT "PublicationAttempt_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

