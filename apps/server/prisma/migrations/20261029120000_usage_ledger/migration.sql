-- Spend ledger: AI calls keep their rows when a brand is deleted, and record tier, cached/reasoning tokens,
-- web searches and cost. Other paid APIs (Places, PageSpeed, Twilio) get their own rows.
ALTER TABLE "AiWorkflowRun" DROP CONSTRAINT "AiWorkflowRun_brandId_workspaceId_fkey";
ALTER TABLE "AiWorkflowRun"
  ADD COLUMN "tier" TEXT,
  ADD COLUMN "cachedInputTokens" INTEGER,
  ADD COLUMN "reasoningTokens" INTEGER,
  ADD COLUMN "webSearchCalls" INTEGER,
  ADD COLUMN "costUsd" DECIMAL(12,6);
CREATE INDEX "AiWorkflowRun_createdAt_idx" ON "AiWorkflowRun"("createdAt");

CREATE TABLE "ApiCall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT,
    "brandId" TEXT,
    "userId" TEXT,
    "provider" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "latencyMs" INTEGER,
    "costUsd" DECIMAL(12,6),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ApiCall_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ApiCall_createdAt_idx" ON "ApiCall"("createdAt");
CREATE INDEX "ApiCall_provider_createdAt_idx" ON "ApiCall"("provider", "createdAt");
