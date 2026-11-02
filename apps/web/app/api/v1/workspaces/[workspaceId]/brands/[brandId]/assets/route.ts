import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { brandUploads } from "@/server/content/knowledge";
import { prisma } from "@/server/db/prisma";
import { BrandAssets, saveEditedColors } from "@/server/research/brand-assets";
import { BrandSummary, CONTENT_LANGUAGES, MAX, oneLine, Preferences, savePreferences, saveSummaryEdit, TONES } from "@/server/research/brand-summary";
import { PlaceListing } from "@/server/integrations/places";
import { signedMediaUrl } from "@/server/storage/media";
import type { TenantScope } from "@/server/tenant/scope";

async function view(scope: Required<TenantScope>) {
  const brand = await prisma.brand.findFirstOrThrow({
    where: { id: scope.brandId, workspaceId: scope.workspaceId },
    select: { displayName: true, profile: { select: { websiteUrl: true, assets: true, summary: true, preferences: true, locales: true, location: true, place: true, uploads: true } } },
  });
  const assets = BrandAssets.safeParse(brand.profile?.assets).data ?? null;
  const summary = BrandSummary.safeParse(brand.profile?.summary).data ?? null;
  const locales = z.array(z.string()).safeParse(brand.profile?.locales).data ?? [];
  // Only ever sign this brand's own objects, whatever the stored JSON says.
  const prefix = `${scope.workspaceId}/${scope.brandId}/`;
  const image = async (key: string | null | undefined) => (key?.startsWith(prefix) ? { key, url: await signedMediaUrl(key) } : null);
  const place = PlaceListing.safeParse(brand.profile?.place).data;
  return {
    name: brand.displayName,
    website: brand.profile?.websiteUrl ?? null,
    // From the Google Maps listing picked in onboarding, else what the owner typed (A07).
    location: place?.address ?? brand.profile?.location ?? null,
    category: place?.type ?? null,
    assets: assets && {
      logo: await image(assets.logo?.key),
      colors: assets.colors,
      colorsEditedAt: assets.colorsEditedAt ?? null,
      fonts: assets.fonts,
      products: await Promise.all(assets.products.map(async (p) => ({ title: p.title, kind: p.kind, url: p.url, image: await image(p.imageKey) }))),
    },
    // The owner's own photos (Business M08), newest first; there even without a website.
    uploads: (await Promise.all(brandUploads(brand.profile?.uploads).map(async (u) => ({ title: u.title, addedAt: u.addedAt, image: await image(u.key) }))))
      .filter((u) => u.image)
      .reverse(),
    summary: summary && { tagline: summary.tagline ?? null, tags: summary.tags ?? [], audience: summary.audience ?? null, strengths: summary.strengths ?? null, foundWebsite: brand.profile?.websiteUrl ? null : (summary.foundWebsite ?? null) },
    preferences: {
      tones: Preferences.safeParse(brand.profile?.preferences).data?.tones ?? null,
      contentLanguage: CONTENT_LANGUAGES.find((l) => l === locales[0]) ?? null,
    },
  };
}

/**
 * Logo, colours, fonts and product photos Research read from the website, its short summary, and the owner's
 * choices (mobile A09/A10). `assets`/`summary` are null until Research wrote them (no website: no assets).
 * Image links last an hour; `key` stays the same, so apps can cache by it.
 */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    return Response.json(await view(scope));
  } catch (error) {
    return fromAccessError(error);
  }
}

/** `#abc` / `#aabbcc` in any case → `#AABBCC`. */
const Hex = z
  .string()
  .trim()
  .regex(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i, "Colours are hex codes like #7C6754")
  .transform((h) => {
    const v = h.replace("#", "").toUpperCase();
    return `#${v.length === 3 ? [...v].map((c) => c + c).join("") : v}`;
  });
const Edit = z
  .object({
    colors: z
      .array(Hex)
      .min(1, "Keep at least one colour")
      .max(5, "Up to 5 colours")
      .refine((c) => new Set(c).size === c.length, "Each colour only once")
      .optional(),
    tagline: z.string().max(500).transform((s) => oneLine(s, MAX.tagline)).optional(),
    audience: z.string().max(1000).transform((s) => oneLine(s, MAX.audience)).optional(),
    tones: z.array(z.enum(TONES)).max(TONES.length).transform((t) => [...new Set(t)]).optional(),
    contentLanguage: z.enum(CONTENT_LANGUAGES).optional(),
    // Takes a photo out of the library (Business M08). The file stays: a scheduled post may still use it.
    removeUpload: z.string().max(300).optional(),
  })
  .strict()
  .refine((b) => Object.values(b).some((v) => v !== undefined), "Nothing to change");

const invalid = (detail: string) => problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid brand details", status: 422, detail });

/**
 * People's edits from A09/A10: palette, tagline, audience, creative tones, content language. Research keeps edited
 * colours and text from then on. Each part is its own single-statement write. Returns the same view as GET.
 */
export async function PATCH(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "context.edit");
    if (scope instanceof Response) return scope;
    const body = Edit.safeParse(await request.json().catch(() => null));
    if (!body.success) return invalid(body.error.issues.map((i) => i.message).join("; "));
    const { colors, tagline, audience, tones, contentLanguage, removeUpload } = body.data;
    if (colors && !(await saveEditedColors(scope, colors))) {
      return problemResponse({ type: "https://api.brandpilot/errors/conflict", title: "No brand colours yet", status: 409, detail: "Brand colours appear once Research has read the website." });
    }
    if (tagline !== undefined) await saveSummaryEdit(scope, "tagline", tagline);
    if (audience !== undefined) await saveSummaryEdit(scope, "audience", audience);
    if (tones !== undefined || contentLanguage !== undefined) await savePreferences(scope, { tones, contentLanguage });
    if (removeUpload) {
      // One statement, so an upload landing at the same time isn't lost.
      await prisma.$executeRaw`
        UPDATE "BrandProfile" SET "updatedAt" = now(), "uploads" = COALESCE((
          SELECT jsonb_agg(u) FROM jsonb_array_elements(COALESCE("uploads", '[]'::jsonb)) u WHERE u ->> 'key' <> ${removeUpload}
        ), '[]'::jsonb)
        WHERE "brandId" = ${scope.brandId} AND "workspaceId" = ${scope.workspaceId}`;
    }
    await prisma.auditEvent.create({
      data: {
        workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "brand.details_edited",
        entityType: "BrandProfile", entityId: scope.brandId, metadata: body.data,
      },
    });
    return Response.json(await view(scope));
  } catch (error) {
    return fromAccessError(error);
  }
}
