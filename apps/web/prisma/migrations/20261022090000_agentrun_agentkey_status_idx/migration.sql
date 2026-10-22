-- Running-audit lookups filter by agent and status across workspaces (shared audit library).
CREATE INDEX "AgentRun_agentKey_status_idx" ON "AgentRun"("agentKey", "status");
