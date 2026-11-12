-- Voiceovers recorded for reel scenes (mobile R11).
CREATE TABLE "ReelRecording" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "contentItemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "seconds" DOUBLE PRECISION NOT NULL,
    "text" TEXT NOT NULL,
    "transcript" TEXT NOT NULL,
    "uploadedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReelRecording_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReelRecording_contentItemId_idx" ON "ReelRecording"("contentItemId");
CREATE INDEX "ReelRecording_createdAt_idx" ON "ReelRecording"("createdAt");

ALTER TABLE "ReelRecording" ADD CONSTRAINT "ReelRecording_contentItemId_fkey" FOREIGN KEY ("contentItemId") REFERENCES "ContentItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
