import type { Product } from "@prisma/client";
import { z } from "zod";
import { httpUrl } from "@/server/catalog/sync";

/** Fields people own on every row; on synced rows these are the only ones they can edit. */
export const PERSON_FIELDS = ["materials", "dimensions", "certifications"] as const;

const text = (max: number) => z.string().trim().max(max).transform((s) => s || null).nullable();
const link = z
  .string()
  .trim()
  .max(2000)
  .transform((s) => s || null)
  .nullable()
  .refine((s) => s === null || httpUrl(s) !== null, "Enter a link that starts with https://");
const money = z.number().nonnegative().max(1_000_000_000).nullable();

/** A product as a person types it. Every key is optional (PATCH); POST also needs a title. */
export const ProductInput = z
  .object({
    title: z.string().trim().min(1).max(300),
    sku: text(100),
    url: link,
    category: text(120),
    description: text(5000),
    materials: text(1000),
    dimensions: text(1000),
    certifications: text(1000),
    price: money,
    compareAtPrice: money,
    currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a 3-letter currency code like EUR").nullable(),
    inStock: z.boolean().nullable(),
    stockQuantity: z.number().int().min(0).max(1_000_000_000).nullable(),
    imageUrl: link,
  })
  .partial()
  .strict();
export type ProductInput = z.infer<typeof ProductInput>;

/** Prisma data from validated input: prices as 2-decimal strings, and a stock answer stamps its freshness. */
export function productData(input: ProductInput) {
  const { price, compareAtPrice, ...rest } = input;
  return {
    ...rest,
    ...(price !== undefined && { price: price === null ? null : price.toFixed(2) }),
    ...(compareAtPrice !== undefined && { compareAtPrice: compareAtPrice === null ? null : compareAtPrice.toFixed(2) }),
    // Only an actual answer is fresh stock; clearing it to "unknown" (null) isn't.
    ...((input.inStock != null || input.stockQuantity != null) && { stockCheckedAt: new Date() }),
  };
}

/** A product with its description: the detail route and writes. */
export const toProductDto = (p: Product) => ({ ...toProductListDto(p), description: p.description });

/** A list row: no description (up to 5,000 characters each; the detail route has it). */
export const toProductListDto = (p: Omit<Product, "description">) => ({
  id: p.id,
  source: p.source,
  sku: p.sku,
  title: p.title,
  url: p.url,
  category: p.category,
  materials: p.materials,
  dimensions: p.dimensions,
  certifications: p.certifications,
  price: p.price?.toFixed(2) ?? null,
  compareAtPrice: p.compareAtPrice?.toFixed(2) ?? null,
  currency: p.currency,
  inStock: p.inStock,
  stockQuantity: p.stockQuantity,
  stockCheckedAt: p.stockCheckedAt?.toISOString() ?? null,
  imageUrl: p.imageUrl,
  archivedAt: p.archivedAt?.toISOString() ?? null,
  updatedAt: p.updatedAt.toISOString(),
});
