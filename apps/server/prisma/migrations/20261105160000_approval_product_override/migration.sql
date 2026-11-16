-- Approver override of product availability issues (brief B6): which products and states were approved anyway, and a send-back asking for another product.
ALTER TABLE "ApprovalDecision" ADD COLUMN "productOverride" JSONB;
ALTER TABLE "ApprovalDecision" ADD COLUMN "switchProducts" BOOLEAN NOT NULL DEFAULT false;
