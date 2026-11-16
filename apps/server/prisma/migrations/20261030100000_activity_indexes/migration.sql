-- Admin console → Activity: a person's chat turns without walking their agent calls; the agent log by workspace.
-- DropIndex
DROP INDEX "AiWorkflowRun_userId_createdAt_idx";

-- CreateIndex
CREATE INDEX "AgentEvent_workspaceId_id_idx" ON "AgentEvent"("workspaceId", "id");

-- CreateIndex
CREATE INDEX "AiWorkflowRun_userId_agentRunId_createdAt_idx" ON "AiWorkflowRun"("userId", "agentRunId", "createdAt");
