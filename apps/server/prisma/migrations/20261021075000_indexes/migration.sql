-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "AgentEvent_runId_id_idx" ON "AgentEvent"("runId", "id");

-- CreateIndex
CREATE INDEX "AiWorkflowRun_agentRunId_idx" ON "AiWorkflowRun"("agentRunId");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_createdAt_idx" ON "AuditEvent"("actorUserId", "createdAt");

-- CreateIndex
CREATE INDEX "BrandContextDoc_brandId_agentRunId_idx" ON "BrandContextDoc"("brandId", "agentRunId");

-- CreateIndex
CREATE INDEX "BrandMember_userId_idx" ON "BrandMember"("userId");

-- CreateIndex
CREATE INDEX "Job_status_leasedUntil_idx" ON "Job"("status", "leasedUntil");

-- CreateIndex
CREATE INDEX "RateLimitBucket_windowStart_idx" ON "RateLimitBucket"("windowStart");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

