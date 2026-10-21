-- CreateTable
CREATE TABLE "ChatThread" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "messages" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatThread_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChatThread_brandId_userId_updatedAt_idx" ON "ChatThread"("brandId", "userId", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatThread_workspaceId_brandId_idx" ON "ChatThread"("workspaceId", "brandId");

-- AddForeignKey
ALTER TABLE "ChatThread" ADD CONSTRAINT "ChatThread_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;

