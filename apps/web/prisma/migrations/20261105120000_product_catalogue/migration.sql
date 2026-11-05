-- Product catalogue (brief "Required onboarding inputs"): website feed, Shopify Admin and manual rows per brand.
ALTER TYPE "IntegrationProvider" ADD VALUE 'SHOPIFY';

CREATE TYPE "ProductSource" AS ENUM ('WEBSITE', 'SHOPIFY', 'MANUAL');

ALTER TABLE "BrandProfile" ADD COLUMN "catalogSync" JSONB;

CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "source" "ProductSource" NOT NULL,
    "externalId" TEXT,
    "sku" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "category" TEXT,
    "description" TEXT,
    "materials" TEXT,
    "dimensions" TEXT,
    "certifications" TEXT,
    "price" DECIMAL(12,2),
    "compareAtPrice" DECIMAL(12,2),
    "currency" TEXT,
    "inStock" BOOLEAN,
    "stockQuantity" INTEGER,
    "stockCheckedAt" TIMESTAMP(3),
    "imageUrl" TEXT,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Product_brandId_source_externalId_key" ON "Product"("brandId", "source", "externalId");

CREATE INDEX "Product_workspaceId_brandId_idx" ON "Product"("workspaceId", "brandId");

ALTER TABLE "Product" ADD CONSTRAINT "Product_brandId_workspaceId_fkey" FOREIGN KEY ("brandId", "workspaceId") REFERENCES "Brand"("id", "workspaceId") ON DELETE CASCADE ON UPDATE CASCADE;
