import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { prisma } from "@/server/db/prisma";
import { assertPublicUrl, CrawlError } from "@/server/research/crawl";
import { EditBrandInput } from "@/server/services/create-brand";

/**
 * Rename the brand or fix its website. Agents read the website on their next run; re-reading it
 * now (Research) is the person's call, since it spends credits and redrafts the documents.
 */
export async function PATCH(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "context.edit");
    if (scope instanceof Response) return scope;
    const body = EditBrandInput.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid brand", status: 422, detail: body.error.issues.map((i) => i.message).join("; ") });
    }
    const { displayName, websiteUrl } = body.data;
    if (websiteUrl) await assertPublicUrl(websiteUrl);
    const before = await prisma.brand.findFirstOrThrow({ where: { id: scope.brandId, workspaceId: scope.workspaceId }, include: { profile: true } });
    await prisma.$transaction([
      prisma.brand.update({ where: { id: before.id }, data: { displayName } }),
      ...(websiteUrl
        ? [prisma.brandProfile.upsert({ where: { brandId: before.id }, create: { brandId: before.id, workspaceId: scope.workspaceId, websiteUrl }, update: { websiteUrl } })]
        : []),
      prisma.auditEvent.create({
        data: {
          workspaceId: scope.workspaceId, brandId: before.id, actorUserId: scope.userId, action: "brand.updated", entityType: "Brand", entityId: before.id,
          metadata: { from: { displayName: before.displayName, websiteUrl: before.profile?.websiteUrl ?? null }, to: { displayName, websiteUrl } },
        },
      }),
    ]);
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CrawlError) {
      return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid website", status: 422, detail: `That website can't be used: ${error.message}.` });
    }
    return fromAccessError(error);
  }
}
