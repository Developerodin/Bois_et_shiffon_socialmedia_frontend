-- Online eval of every AI answer (server/ai/graders.ts)
ALTER TABLE "AiWorkflowRun" ADD COLUMN "evalPassed" BOOLEAN, ADD COLUMN "evalFindings" JSONB;
