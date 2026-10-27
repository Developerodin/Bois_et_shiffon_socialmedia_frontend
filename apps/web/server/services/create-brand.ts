import { Prisma } from "@prisma/client";
import { z } from "zod";
import { AgentStartError, startAgentRun } from "@/server/agents/engine";
import { requirePermission } from "@/server/auth/permissions";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db/prisma";

export const CreateBrandInput = z.object({
  displayName: z.string().trim().min(1).max(80),
  websiteUrl: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), "Website must start with http:// or https://"),
});

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

  const base = slugify(input.displayName);
  let brand;
  for (let i = 0; !brand; i++) {
    try {
      brand = await prisma.brand.create({
        data: {
          workspaceId,
          slug: i === 0 ? base : `${base}-${i + 1}`,
          displayName: input.displayName,
          profile: { create: { websiteUrl: input.websiteUrl } },
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
      metadata: { websiteUrl: input.websiteUrl },
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
  for (const agentKey of ["seo", "geo"]) {
    await startAgentRun({ workspaceId, brandId: brand.id, agentKey, trigger: "event", userId });
  }
  return { brand, researchRunId: run.id };
}
