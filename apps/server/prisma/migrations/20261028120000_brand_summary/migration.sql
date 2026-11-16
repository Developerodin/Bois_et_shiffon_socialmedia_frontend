-- Brand summary (A09) drafted by Research, and the owner's creative tones (A10)
ALTER TABLE "BrandProfile" ADD COLUMN "summary" JSONB,
ADD COLUMN "preferences" JSONB;
