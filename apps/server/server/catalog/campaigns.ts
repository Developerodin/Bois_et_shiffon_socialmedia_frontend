import type { Campaign, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { campaignKind, wallTime, WallTimeError, zonedInstant } from "@/server/content/offer-checks";

type Scope = { workspaceId: string; brandId: string };
type Db = Pick<PrismaClient, "brand"> | Prisma.TransactionClient;

/** The zone used when a brand never set one (campaigns can't be saved without one, so only campaign-less brands). */
export const DEFAULT_TIME_ZONE = "UTC";

/**
 * campaignsById(db, scope, ids) → the brand's campaigns among `ids` (archived included; another brand's id is
 * simply missing = withdrawn) and the brand's timeZone, from one query. No ids → no query, UTC.
 */
export async function campaignsById(db: Db, scope: Scope, ids: (string | null | undefined)[]): Promise<{ campaigns: Map<string, Campaign>; timeZone: string }> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  if (!unique.length) return { campaigns: new Map(), timeZone: DEFAULT_TIME_ZONE };
  const brand = await db.brand.findFirst({
    where: { id: scope.brandId, workspaceId: scope.workspaceId },
    select: { profile: { select: { timeZone: true } }, campaigns: { where: { id: { in: unique } } } },
  });
  return { campaigns: new Map((brand?.campaigns ?? []).map((c) => [c.id, c])), timeZone: brand?.profile?.timeZone ?? DEFAULT_TIME_ZONE };
}

/**
 * campaignsForPlanning(db, scope, from, to) → campaigns the Planner plans for: not archived, started before `to`,
 * no end or ending after `from` (oldest start first), and the brand's timeZone, from one query.
 */
export async function campaignsForPlanning(db: Db, scope: Scope, from: Date, to: Date): Promise<{ campaigns: Campaign[]; timeZone: string }> {
  const brand = await db.brand.findFirst({
    where: { id: scope.brandId, workspaceId: scope.workspaceId },
    select: {
      profile: { select: { timeZone: true } },
      campaigns: { where: { archivedAt: null, startsAt: { lt: to }, OR: [{ endsAt: null }, { endsAt: { gt: from } }] }, orderBy: { startsAt: "asc" } },
    },
  });
  return { campaigns: brand?.campaigns ?? [], timeZone: brand?.profile?.timeZone ?? DEFAULT_TIME_ZONE };
}

// ---------- Campaign routes (app/api/v1/.../brands/[brandId]/campaigns) ----------

/** Statuses whose posts an offer edit or withdrawal holds: the affected-posts list. */
export const AFFECTED_STATUSES = ["AWAITING_APPROVAL", "APPROVED", "SCHEDULED"] as const;
export type AffectedPost = { id: string; title: string; status: string; scheduledFor: string | null };

/** affectedPosts(db, scope, campaignIds) → per campaign id, its posts awaiting approval, approved or scheduled. */
export async function affectedPosts(db: Pick<PrismaClient, "contentItem">, scope: Scope, campaignIds: string[]): Promise<Map<string, AffectedPost[]>> {
  const out = new Map<string, AffectedPost[]>(campaignIds.map((id) => [id, []]));
  if (!campaignIds.length) return out;
  const items = await db.contentItem.findMany({
    where: { workspaceId: scope.workspaceId, brandId: scope.brandId, campaignId: { in: campaignIds }, status: { in: [...AFFECTED_STATUSES] } },
    select: { id: true, title: true, status: true, scheduledFor: true, campaignId: true },
    orderBy: { scheduledFor: "asc" },
  });
  for (const i of items) out.get(i.campaignId!)?.push({ id: i.id, title: i.title, status: i.status, scheduledFor: i.scheduledFor?.toISOString() ?? null });
  return out;
}

/** One line of 1–max characters: campaign text goes into prompts. */
const line = (max: number) => z.string().transform((s) => s.replace(/\s+/g, " ").trim()).pipe(z.string().min(1).max(max));
const local = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, "Times are YYYY-MM-DDTHH:mm");

/**
 * A campaign as the form sends it; times are wall-clock strings in the brand zone. Every key optional (PATCH);
 * POST needs name and startsAt. Cross-field rules live in `campaignRuleError`.
 */
export const CampaignInput = z
  .object({
    name: line(80),
    startsAt: local,
    endsAt: local.nullable(),
    productIds: z.array(z.string().min(1).max(100)).max(50, "At most 50 products: use categories or the whole catalogue"),
    categories: z.array(line(80)).max(20, "At most 20 categories: use the whole catalogue"),
    offer: line(500).nullable(),
    discountPercent: z.number().int().min(1).max(90).nullable(),
    code: line(40).nullable(),
  })
  .partial()
  .strict();
export type CampaignInput = z.infer<typeof CampaignInput>;

type Stored = Pick<Campaign, "name" | "startsAt" | "endsAt" | "productIds" | "categories" | "offer" | "discountPercent" | "code">;

/** The rules across fields of a whole (merged) campaign, or null: terms need an offer, an offer needs an end, end after start. */
export function campaignRuleError(c: Stored) {
  if ((c.discountPercent !== null || c.code !== null) && !c.offer) return "A discount or code needs the offer's wording (what customers get).";
  if (c.offer && !c.endsAt) return "An offer needs an end date and time.";
  if (c.endsAt && c.endsAt.getTime() <= c.startsAt.getTime()) return "The end must be after the start.";
  return null;
}

/**
 * campaignData(db, scope, input, current, timeZone) → the whole campaign to write (input over `current`, which is
 * null for a POST), or a message for a 400: no brand zone, a malformed or non-existent wall time, a missing name or
 * start, a broken `campaignRuleError` rule, or product ids not in this brand (ids already stored are kept unchecked,
 * so a product deleted since doesn't block an unrelated edit).
 */
export async function campaignData(
  db: Pick<PrismaClient, "product">, scope: Scope, input: CampaignInput, current: Stored | null, timeZone: string | null,
): Promise<Stored | string> {
  if (!timeZone) return "Set the brand's timezone first.";
  const pick = <K extends keyof Stored>(k: K, fallback: Stored[K]) => (input[k as keyof CampaignInput] !== undefined ? input[k as keyof CampaignInput] : current ? current[k] : fallback);
  let startsAt: Date | undefined;
  let endsAt: Date | null;
  try {
    startsAt = input.startsAt !== undefined ? zonedInstant(input.startsAt, timeZone) : current?.startsAt;
    endsAt = input.endsAt !== undefined ? (input.endsAt ? zonedInstant(input.endsAt, timeZone) : null) : current?.endsAt ?? null;
  } catch (e) {
    if (e instanceof WallTimeError) return e.message;
    throw e;
  }
  const name = pick("name", "") as string;
  if (!name) return "Give the campaign a name.";
  if (!startsAt) return "Give the campaign a start date and time.";
  const merged: Stored = {
    name, startsAt, endsAt,
    productIds: [...new Set(pick("productIds", []) as string[])],
    categories: [...new Set(pick("categories", []) as string[])],
    offer: pick("offer", null) as string | null,
    discountPercent: pick("discountPercent", null) as number | null,
    code: pick("code", null) as string | null,
  };
  const broken = campaignRuleError(merged);
  if (broken) return broken;
  const fresh = merged.productIds.filter((id) => !current?.productIds.includes(id));
  if (fresh.length && (await db.product.count({ where: { workspaceId: scope.workspaceId, brandId: scope.brandId, id: { in: fresh } } })) !== fresh.length) {
    return "Some of those products aren't in this brand's catalogue.";
  }
  return merged;
}

const AUDITED = ["name", "startsAt", "endsAt", "productIds", "categories", "offer", "discountPercent", "code", "archivedAt"] as const;
const plain = (v: string | number | string[] | Date | null): string | number | string[] | null => (v instanceof Date ? v.toISOString() : v);

/** Audit metadata `{ field: [before, after] }` for the fields that differ (before null = created). */
export function campaignChanges(before: Partial<Stored & Pick<Campaign, "archivedAt">> | null, after: Stored & Pick<Campaign, "archivedAt">) {
  return Object.fromEntries(
    AUDITED.flatMap((f) => {
      const [b, a] = [plain(before?.[f] ?? null), plain(after[f])];
      return JSON.stringify(b) === JSON.stringify(a) ? [] : [[f, [b, a]]];
    }),
  );
}

/** A campaign for the web section: times as instants and as brand wall-clock strings, plus its affected posts. */
export const toCampaignDto = (c: Campaign, timeZone: string, posts: AffectedPost[]) => ({
  id: c.id,
  kind: campaignKind(c),
  name: c.name,
  startsAt: c.startsAt.toISOString(),
  endsAt: c.endsAt?.toISOString() ?? null,
  starts: wallTime(c.startsAt, timeZone),
  ends: c.endsAt ? wallTime(c.endsAt, timeZone) : null,
  productIds: c.productIds,
  categories: c.categories,
  offer: c.offer,
  discountPercent: c.discountPercent,
  code: c.code,
  archivedAt: c.archivedAt?.toISOString() ?? null,
  updatedAt: c.updatedAt.toISOString(),
  affectedPosts: posts,
});
