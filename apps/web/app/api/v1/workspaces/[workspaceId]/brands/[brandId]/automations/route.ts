import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { prisma } from "@/server/db/prisma";
import { AutomationsChange, readAutomations, saveAutomations } from "@/server/services/automations";

/** The owner's automations (mobile Business M10). */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    return Response.json(await readAutomations(scope));
  } catch (error) {
    return fromAccessError(error);
  }
}

/**
 * Turn automations on or off. Auto-publish posts for the brand (publish.execute); the monthly plan starts a paid
 * agent run every month (agents.run, as the app's Generate calendar).
 */
export async function PATCH(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const body = AutomationsChange.safeParse(await request.json().catch(() => null));
    if (!body.success || Object.keys(body.data).length === 0) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400 });
    let scope = null;
    for (const permission of [body.data.autoPublish !== undefined && "publish.execute", body.data.monthlyPlan !== undefined && "agents.run"] as const) {
      if (!permission) continue;
      const allowed = await authorizeBrandRoute(request, context.params, permission);
      if (allowed instanceof Response) return allowed;
      scope = allowed;
    }
    if (!scope) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400 });
    const saved = await saveAutomations(scope, body.data);
    if (!saved) return problemResponse({ type: "https://api.brandpilot/errors/conflict", title: "This business has no profile yet", status: 409 });
    await prisma.auditEvent.create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "brand.automations_changed", entityType: "BrandProfile", entityId: scope.brandId, metadata: body.data },
    });
    return Response.json(saved);
  } catch (error) {
    return fromAccessError(error);
  }
}
