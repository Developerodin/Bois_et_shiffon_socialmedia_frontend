-- Optional HTML body for outbox emails.

-- AlterTable
ALTER TABLE "EmailOutbox" ADD COLUMN     "html" TEXT;
