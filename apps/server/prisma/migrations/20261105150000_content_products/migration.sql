-- Posts link the catalogue products they feature (brief B1/B2/B6): ids of "Product" rows, checked at Quality, approval and publish.
ALTER TABLE "ContentItem" ADD COLUMN "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
