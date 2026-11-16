import { prisma } from "@/server/db/prisma";
import { PlaceListing } from "@/server/integrations/places";

/**
 * Loads exactly one brand's context for one agent run (DEC-023, REQ-PLAT-003).
 * Agents never receive another brand's data: this is the only loader they get.
 */
export type BrandContext = {
  workspaceId: string;
  brandId: string;
  displayName: string;
  websiteUrl: string | null;
  /** Owner's own words when there's no website (what they sell, where). */
  about: string | null;
  location: string | null;
  /** The Google Maps listing the owner picked in onboarding, if any. */
  place: PlaceListing | null;
  voiceSummary: string | null;
  pillars: unknown;
  locales: unknown;
};

export async function loadBrandContext(
  workspaceId: string,
  brandId: string,
): Promise<BrandContext> {
  const brand = await prisma.brand.findFirstOrThrow({
    where: { id: brandId, workspaceId, status: "ACTIVE" },
    include: { profile: true },
  });
  return {
    workspaceId,
    brandId,
    displayName: brand.displayName,
    websiteUrl: brand.profile?.websiteUrl ?? null,
    about: brand.profile?.about ?? null,
    location: brand.profile?.location ?? null,
    place: PlaceListing.safeParse(brand.profile?.place).data ?? null,
    voiceSummary: brand.profile?.voiceSummary ?? null,
    pillars: brand.profile?.pillars ?? null,
    locales: brand.profile?.locales ?? null,
  };
}
