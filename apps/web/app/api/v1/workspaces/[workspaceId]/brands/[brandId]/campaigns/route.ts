import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { CampaignInput, DEFAULT_TIME_ZONE, affectedPosts, campaignChanges, campaignData, toCampaignDto } from "@/server/catalog/campaigns";
import { prisma } from "@/server/db/prisma";

const ENDED_SHOWN_MS = 30 * 86_400_000;
const invalid = (detail?: string) => problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid campaign", status: 400, detail });

/**
 * The brand's campaigns for the web section: standing priorities, live, upcoming and those ended in the last 30
 * days (archived hidden), each with its posts awaiting approval, approved or scheduled; and the brand timezone
 * (null = not set yet: the first save asks for it).
 * ponytail: no pagination; a brand runs a handful of campaigns a month.
 */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const where = { workspaceId: scope.workspaceId, brandId: scope.brandId };
    const [campaigns, profile] = await Promise.all([
      prisma.campaign.findMany({
        where: { ...where, archivedAt: null, OR: [{ endsAt: null }, { endsAt: { gt: new Date(Date.now() - ENDED_SHOWN_MS) } }] },
        orderBy: { startsAt: "asc" },
      }),
      prisma.brandProfile.findFirst({ where, select: { timeZone: true } }),
    ]);
    const timeZone = profile?.timeZone ?? null;
    const posts = await affectedPosts(prisma, scope, campaigns.map((c) => c.id));
    return Response.json({ timeZone, campaigns: campaigns.map((c) => toCampaignDto(c, timeZone ?? DEFAULT_TIME_ZONE, posts.get(c.id) ?? [])) });
  } catch (error) {
    return fromAccessError(error);
  }
}

/** Create a campaign, offer or standing priority (commercial.manage). Times are wall-clock in the brand timezone. */
export async function POST(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "commercial.manage");
    if (scope instanceof Response) return scope;
    const body = CampaignInput.safeParse(await request.json().catch(() => null));
    if (!body.success) return invalid(body.error.issues[0]?.message);
    const where = { workspaceId: scope.workspaceId, brandId: scope.brandId };
    const profile = await prisma.brandProfile.findFirst({ where, select: { timeZone: true } });
    const timeZone = profile?.timeZone ?? null;
    const data = await campaignData(prisma, scope, body.data, null, timeZone);
    if (typeof data === "string") return invalid(data);
    const campaign = await prisma.campaign.create({ data: { ...data, ...where } });
    await prisma.auditEvent.create({
      data: { ...where, actorUserId: scope.userId, action: "campaign.created", entityType: "Campaign", entityId: campaign.id, metadata: campaignChanges(null, campaign) },
    });
    return Response.json({ campaign: toCampaignDto(campaign, timeZone ?? DEFAULT_TIME_ZONE, []) }, { status: 201 });
  } catch (error) {
    return fromAccessError(error);
  }
}
