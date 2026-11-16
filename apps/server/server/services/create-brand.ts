import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AgentStartError, startAgentRun } from "@/server/agents/engine";
import { requirePermission } from "@/server/auth/permissions";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db/prisma";
import { PlaceId, placeDetails } from "@/server/integrations/places";
import { nameFromWebsite } from "@/server/research/brand-assets";

/** A listing's website, if it's an http(s) address (it's Google data; the crawler still applies its own guards). */
const listingWebsite = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) && z.string().url().safeParse(u).success ? u : undefined);

/** Field rules shared by create and edit; each adds its own cross-field checks (zod 4 can't .partial() a refined schema). */
export const BrandFields = z.object({
  /** Optional with a website: the brand is then named the way the site names itself. */
  displayName: z.string().trim().min(1).max(80).optional(),
    websiteUrl: z
      .string()
      .trim()
      .url()
      .refine((u) => /^https?:\/\//i.test(u), "Website must start with http:// or https://")
      .optional(),
    goal: z.enum(["social-plan", "marketing-videos", "fashion-photoshoot", "product-photoshoot"]).optional(),
    /** No website: what they sell and where, so Research can find the business with web search. */
    about: z.string().trim().min(4).max(500).optional(),
    location: z.string().trim().max(120).optional(),
});

/** Creating a brand can also start from a Google Maps listing the owner picked (mobile onboarding). */
const CreateOnly = z.object({
  placeId: PlaceId.optional(),
  /** Language for the listing's type and hours (the app's language). */
  language: z.string().regex(/^[a-z]{2}(-[A-Z]{2})?$/).optional(),
});

export const CreateBrandInput = BrandFields.extend(CreateOnly.shape)
  .refine((b) => b.websiteUrl || b.about || b.placeId, "Add a website, or say what the business sells")
  .refine((b) => b.displayName || b.websiteUrl || b.placeId, "Name the business");

/** Rename the brand or fix its website (brand PATCH): either or both. */
export const EditBrandInput = BrandFields.pick({ displayName: true, websiteUrl: true }).refine(
  (b) => b.displayName !== undefined || b.websiteUrl !== undefined,
  "Change the name or the website",
);

const slugify = (s: string) =>
  s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "brand";

/** New brand + profile, then the Research agent drafts its context docs (design §8b-5). */
export async function createBrandWithResearch(
  workspaceId: string,
  userId: string,
  input: z.infer<typeof CreateBrandInput>,
) {
  await requirePermission(workspaceId, userId, "brand.create");
  // Each new brand starts a paid Research run.
  const { allowed } = await hitRateLimit(`brands:${userId}`, 10, 86_400_000);
  if (!allowed) throw new AgentStartError("You've added 10 brands today, the daily limit. Try again tomorrow.", 429);

  // A picked Maps listing fills what the owner didn't type: name, website (Research then reads it), address, and a
  // description for the no-website lookup. Read here, server-side, from the id: never trusted from the app.
  const place = input.placeId ? await placeDetails(input.placeId, input.language ?? "en", { workspaceId, userId }).catch(() => null) : null;
  if (input.placeId && !place) throw new AgentStartError("Couldn't load that Google Maps listing. Search again or describe your business.", 422);
  const websiteUrl = input.websiteUrl ?? listingWebsite(place?.website);
  const about = input.about ?? (websiteUrl ? undefined : (place?.summary ?? place?.type ?? undefined));
  if (!websiteUrl && !about) throw new AgentStartError("Say what the business sells", 422);
  const location = input.location ?? place?.address ?? undefined;
  const displayName = input.displayName ?? place?.name ?? (await nameFromWebsite(websiteUrl!));
  const base = slugify(displayName);
  let brand;
  for (let i = 0; !brand; i++) {
    try {
      brand = await prisma.brand.create({
        data: {
          workspaceId,
          slug: i === 0 ? base : `${base}-${i + 1}`,
          displayName,
          profile: { create: { websiteUrl, goal: input.goal, about, location: location?.slice(0, 120), place: place ?? undefined } },
        },
      });
    } catch (error) {
      const slugTaken = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!slugTaken || i >= 20) throw error;
    }
  }
  await prisma.auditEvent.create({
    data: {
      workspaceId,
      brandId: brand.id,
      actorUserId: userId,
      action: "brand.created",
      entityType: "Brand",
      entityId: brand.id,
      metadata: { websiteUrl: websiteUrl ?? null, placeId: place?.id ?? null },
    },
  });
  const run = await startAgentRun({
    workspaceId,
    brandId: brand.id,
    agentKey: "research",
    trigger: "event",
    userId,
  });
  // Site scores alongside the documents: SEO and GEO read the site themselves, so they run in parallel.
  // No website, nothing to score.
  for (const agentKey of websiteUrl ? ["seo", "geo"] : []) {
    await startAgentRun({ workspaceId, brandId: brand.id, agentKey, trigger: "event", userId });
  }
  return { brand, researchRunId: run.id };
}
