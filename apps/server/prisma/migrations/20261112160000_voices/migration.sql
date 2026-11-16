-- Cloned voices (ElevenLabs), at most two live per workspace.
CREATE TABLE "Voice" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "providerVoiceId" TEXT,
    "sampleKey" TEXT,
    "consent" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Voice_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Voice_workspaceId_archivedAt_idx" ON "Voice"("workspaceId", "archivedAt");

ALTER TABLE "Voice" ADD CONSTRAINT "Voice_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Who may clone: the new workspace-only "voices.manage" key. Owner roles are re-synced from the catalog at startup;
-- existing Admin roles never are, so they get it here (once).
UPDATE "Role" SET "permissions" = array_append("permissions", 'voices.manage')
WHERE "slug" = 'admin' AND "isSystem" = true AND NOT ('voices.manage' = ANY("permissions"));
