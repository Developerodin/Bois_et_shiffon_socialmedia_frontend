import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { isTimeZone } from "@/server/content/offer-checks";
import { prisma } from "@/server/db/prisma";

const Body = z.object({ timeZone: z.string().trim().min(1).max(64) }).strict();

/**
 * Set the brand timezone campaign times are entered and shown in (commercial.manage). Stored instants stay, so
 * existing campaigns then read in the new zone (a 20:00 Paris end shows as 14:00 in Montreal).
 * Ceiling: one zone per brand; a zone per campaign is the upgrade for per-market offers.
 */
export async function PUT(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "commercial.manage");
    if (scope instanceof Response) return scope;
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success || !isTimeZone(body.data.timeZone)) {
      return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid timezone", status: 400, detail: "Pick a timezone like Europe/Paris." });
    }
    const { timeZone } = body.data;
    const where = { workspaceId: scope.workspaceId, brandId: scope.brandId };
    const before = await prisma.brandProfile.findFirst({ where, select: { timeZone: true } });
    await prisma.brandProfile.upsert({ where: { brandId: scope.brandId }, create: { ...where, timeZone }, update: { timeZone } });
    await prisma.auditEvent.create({
      data: { ...where, actorUserId: scope.userId, action: "brand.timezone_set", entityType: "Brand", entityId: scope.brandId, metadata: { timeZone: [before?.timeZone ?? null, timeZone] } },
    });
    return Response.json({ timeZone });
  } catch (error) {
    return fromAccessError(error);
  }
}
