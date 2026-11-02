-- The owner's automations from the app (Business M10): monthly content plan, auto-publish approved posts.
ALTER TABLE "BrandProfile" ADD COLUMN "automations" JSONB;
