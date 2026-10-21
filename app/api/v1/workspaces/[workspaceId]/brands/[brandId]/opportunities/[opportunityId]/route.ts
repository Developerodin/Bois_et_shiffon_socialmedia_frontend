import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { prisma } from "@/server/db/prisma";

const Body = z.object({ status: z.enum(["NEW", "SHORTLISTED", "DISMISSED"]) });

/** Shortlist, dismiss or reset an idea. Planned ideas are locked (their posts exist). */
export async function PATCH(request: Request, context: { params: Promise<BrandRouteParams & { opportunityId: string }> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    const { opportunityId } = await context.params;
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 422 });
    const { count } = await prisma.opportunity.updateMany({
      where: { id: opportunityId, workspaceId: scope.workspaceId, brandId: scope.brandId, status: { not: "PLANNED" } },
      data: { status: body.data.status },
    });
    if (!count) return problemResponse({ type: "https://api.brandpilot/errors/not-found", title: "Not found or already planned", status: 404 });
    await prisma.auditEvent.create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: `opportunity.${body.data.status.toLowerCase()}`, entityType: "Opportunity", entityId: opportunityId },
    });
    return Response.json({ ok: true });
  } catch (error) {
    return fromAccessError(error);
  }
}
