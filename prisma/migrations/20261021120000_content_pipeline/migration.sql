-- CreateEnum
CREATE TYPE "OpportunityDecision" AS ENUM ('RECOMMEND', 'HOLD', 'REJECT');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('NEW', 'SHORTLISTED', 'DISMISSED', 'PLANNED');

-- CreateEnum
CREATE TYPE "ContentChannel" AS ENUM ('INSTAGRAM_POST', 'INSTAGRAM_CAROUSEL', 'INSTAGRAM_REEL', 'FACEBOOK_POST', 'PINTEREST_PIN', 'THREADS_POST');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('PLANNED', 'BRIEF_READY', 'DRAFT_REVIEW', 'AWAITING_APPROVAL', 'APPROVED', 'SCHEDULED', 'PUBLISHED', 'REVIEWED', 'REJECTED', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "QualityOverall" AS ENUM ('PASS', 'WARN', 'BLOCKER');

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "angle" TEXT NOT NULL,
    "channels" TEXT[],
    "decision" "OpportunityDecision" NOT NULL,
    "reason" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "timing" TEXT,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "status" "OpportunityStatus" NOT NULL DEFAULT 'NEW',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentItem" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "opportunityId" TEXT,
    "title" TEXT NOT NULL,
    "channel" "ContentChannel" NOT NULL,
    "status" "ContentStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledFor" TIMESTAMP(3),
    "pillar" TEXT,
    "brief" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentVersion" (
    "id" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "body" JSONB NOT NULL,
    "createdBy" TEXT NOT NULL,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualityCheck" (
    "id" TEXT NOT NULL,
    "contentVersionId" TEXT NOT NULL,
    "overall" "QualityOverall" NOT NULL,
    "results" JSONB NOT NULL,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QualityCheck_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LearningNote" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LearningNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Opportunity_workspaceId_brandId_status_score_idx" ON "Opportunity"("workspaceId", "brandId", "status", "score");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_brandId_dedupeKey_key" ON "Opportunity"("brandId", "dedupeKey");

-- CreateIndex
CREATE INDEX "ContentItem_workspaceId_brandId_status_idx" ON "ContentItem"("workspaceId", "brandId", "status");

-- CreateIndex
CREATE INDEX "ContentItem_brandId_scheduledFor_idx" ON "ContentItem"("brandId", "scheduledFor");

-- CreateIndex
CREATE UNIQUE INDEX "ContentVersion_contentItemId_version_key" ON "ContentVersion"("contentItemId", "version");

-- CreateIndex
CREATE INDEX "QualityCheck_contentVersionId_createdAt_idx" ON "QualityCheck"("contentVersionId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningNote_workspaceId_brandId_createdAt_idx" ON "LearningNote"("workspaceId", "brandId", "createdAt");

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentItem" ADD CONSTRAINT "ContentItem_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "Opportunity"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentVersion" ADD CONSTRAINT "ContentVersion_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualityCheck" ADD CONSTRAINT "QualityCheck_contentVersionId_fkey" FOREIGN KEY ("contentVersionId") REFERENCES "ContentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LearningNote" ADD CONSTRAINT "LearningNote_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

