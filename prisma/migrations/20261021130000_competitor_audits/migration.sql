-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SiteAudit" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "scores" JSONB NOT NULL,
    "findings" JSONB NOT NULL,
    "aiCrawlers" JSONB NOT NULL,
    "approach" JSONB NOT NULL,
    "socials" JSONB NOT NULL,
    "sources" JSONB NOT NULL DEFAULT '[]',
    "pagesRead" INTEGER NOT NULL,
    "requestedByWorkspaceId" TEXT,
    "agentRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SiteAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditEntry" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "refId" TEXT,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competitor_workspaceId_brandId_idx" ON "Competitor"("workspaceId", "brandId");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_brandId_domain_key" ON "Competitor"("brandId", "domain");

-- CreateIndex
CREATE INDEX "SiteAudit_domain_createdAt_idx" ON "SiteAudit"("domain", "createdAt");

-- CreateIndex
CREATE INDEX "CreditEntry_workspaceId_createdAt_idx" ON "CreditEntry"("workspaceId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CreditEntry_workspaceId_reason_refId_key" ON "CreditEntry"("workspaceId", "reason", "refId");

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

