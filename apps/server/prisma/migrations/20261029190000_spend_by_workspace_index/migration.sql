-- Platform admin console (/admin): spend and usage per workspace.
-- CreateIndex
CREATE INDEX "AiWorkflowRun_workspaceId_createdAt_idx" ON "AiWorkflowRun"("workspaceId", "createdAt");

-- CreateIndex
CREATE INDEX "ApiCall_workspaceId_createdAt_idx" ON "ApiCall"("workspaceId", "createdAt");

