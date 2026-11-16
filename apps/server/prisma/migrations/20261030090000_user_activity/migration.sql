-- Admin console → Activity: who caused each AI call, and page visits from web and mobile.
-- AlterTable
ALTER TABLE "AiWorkflowRun" ADD COLUMN     "userId" TEXT;

-- CreateTable
CREATE TABLE "PageView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "brandId" TEXT,
    "platform" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PageView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PageView_workspaceId_userId_createdAt_idx" ON "PageView"("workspaceId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "PageView_userId_createdAt_idx" ON "PageView"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_triggeredByUserId_createdAt_idx" ON "AgentRun"("triggeredByUserId", "createdAt");

-- CreateIndex
CREATE INDEX "AiWorkflowRun_userId_createdAt_idx" ON "AiWorkflowRun"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiCall_userId_createdAt_idx" ON "ApiCall"("userId", "createdAt");

-- Credit agent spend from before this column existed to whoever started the run (old chat turns stay null).
UPDATE "AiWorkflowRun" w SET "userId" = r."triggeredByUserId"
FROM "AgentRun" r WHERE r.id = w."agentRunId" AND w."userId" IS NULL;
