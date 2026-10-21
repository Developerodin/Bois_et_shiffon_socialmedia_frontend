-- CreateEnum
CREATE TYPE "AuditKind" AS ENUM ('SEO', 'GEO');

-- CreateTable
CREATE TABLE "AuditReport" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "kind" "AuditKind" NOT NULL,
    "score" INTEGER NOT NULL,
    "summary" TEXT NOT NULL,
    "findings" JSONB NOT NULL,
    "metrics" JSONB NOT NULL,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditReport_brandId_kind_createdAt_idx" ON "AuditReport"("brandId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "AuditReport_workspaceId_brandId_idx" ON "AuditReport"("workspaceId", "brandId");

-- AddForeignKey
ALTER TABLE "AuditReport" ADD CONSTRAINT "AuditReport_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

