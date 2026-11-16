-- Photos the owner adds to the brand's library from the app (Business M08), next to Research's product photos.
ALTER TABLE "BrandProfile" ADD COLUMN "uploads" JSONB;
