-- CreateEnum
CREATE TYPE "ContextDocStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'SUPERSEDED');

-- CreateTable
CREATE TABLE "BrandContextDoc" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "ContextDocStatus" NOT NULL DEFAULT 'DRAFT',
    "markdown" TEXT NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "agentRunId" TEXT,
    "createdByUserId" TEXT,
    "confirmedByUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BrandContextDoc_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandContextDoc_brandId_kind_status_idx" ON "BrandContextDoc"("brandId", "kind", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BrandContextDoc_brandId_kind_version_key" ON "BrandContextDoc"("brandId", "kind", "version");

-- AddForeignKey
ALTER TABLE "BrandContextDoc" ADD CONSTRAINT "BrandContextDoc_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

