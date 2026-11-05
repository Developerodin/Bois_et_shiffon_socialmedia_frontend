import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { CampaignInput, DEFAULT_TIME_ZONE, affectedPosts, campaignChanges, campaignData, toCampaignDto } from "@/server/catalog/campaigns";
import { prisma } from "@/server/db/prisma";

type Params = BrandRouteParams & { campaignId: string };

const invalid = (detail?: string) => problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid campaign", status: 400, detail });
const notFound = () => problemResponse({ type: "https://api.brandpilot/errors/not-found", title: "Not found", status: 404 });

/** This brand's campaign (archived ones are 404: not editable) and the brand timezone. */
async function load(scope: { workspaceId: string; brandId: string }, campaignId: string) {
  const where = { workspaceId: scope.workspaceId, brandId: scope.brandId };
  const [campaign, profile] = await Promise.all([
    prisma.campaign.findFirst({ where: { ...where, id: campaignId, archivedAt: null } }),
    prisma.brandProfile.findFirst({ where, select: { timeZone: true } }),
  ]);
  return { campaign, timeZone: profile?.timeZone ?? null };
}

/**
 * Edit a campaign (commercial.manage). Returns it with the posts it affects: changing the terms, shortening the
 * times or taking products or categories out holds those posts at the gate until rewritten (nothing on them is
 * changed here). Concurrent edits: last write wins, both audited. ponytail: an updatedAt check if that bites.
 */
export async function PATCH(request: Request, context: { params: Promise<Params> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "commercial.manage");
    if (scope instanceof Response) return scope;
    const { campaignId } = await context.params;
    const body = CampaignInput.safeParse(await request.json().catch(() => null));
    if (!body.success) return invalid(body.error.issues[0]?.message);
    if (!Object.keys(body.data).length) return invalid();
    const { campaign: current, timeZone } = await load(scope, campaignId);
    if (!current) return notFound();
    const data = await campaignData(prisma, scope, body.data, current, timeZone);
    if (typeof data === "string") return invalid(data);
    const campaign = await prisma.campaign.update({ where: { id: current.id }, data });
    await prisma.auditEvent.create({
      data: {
        workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "campaign.updated", entityType: "Campaign", entityId: campaign.id,
        metadata: campaignChanges(current, campaign),
      },
    });
    const posts = await affectedPosts(prisma, scope, [campaign.id]);
    return Response.json({ campaign: toCampaignDto(campaign, timeZone ?? DEFAULT_TIME_ZONE, posts.get(campaign.id) ?? []) });
  } catch (error) {
    return fromAccessError(error);
  }
}

/**
 * Withdraw (archive) a campaign (commercial.manage); never deleted, so posts, history and audit keep reading it.
 * Returns the posts it affects: the gate holds them as "withdrawn" until rewritten.
 */
export async function DELETE(request: Request, context: { params: Promise<Params> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "commercial.manage");
    if (scope instanceof Response) return scope;
    const { campaignId } = await context.params;
    const { campaign: current, timeZone } = await load(scope, campaignId);
    if (!current) return notFound();
    const campaign = await prisma.campaign.update({ where: { id: current.id }, data: { archivedAt: new Date() } });
    await prisma.auditEvent.create({
      data: {
        workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "campaign.archived", entityType: "Campaign", entityId: campaign.id,
        metadata: campaignChanges(current, campaign),
      },
    });
    const posts = await affectedPosts(prisma, scope, [campaign.id]);
    return Response.json({ campaign: toCampaignDto(campaign, timeZone ?? DEFAULT_TIME_ZONE, posts.get(campaign.id) ?? []) });
  } catch (error) {
    return fromAccessError(error);
  }
}
