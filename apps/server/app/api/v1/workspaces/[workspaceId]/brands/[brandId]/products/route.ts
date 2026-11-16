import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { ProductInput, cannotVouch, productData, toProductDto, toProductListDto, vouchedIn } from "@/server/catalog/products";
import { catalogSource, catalogSyncRunning } from "@/server/catalog/sync";
import { effectivePermissions } from "@/server/auth/permissions";
import { prisma } from "@/server/db/prisma";
import { kickIfDue } from "@/server/jobs/runner";

/**
 * The brand's products (active by default; ?archived=1 for the archived ones), newest-updated first, with the
 * last sync's outcome, which source syncs, and whether a sync is queued or running. ?status=1 leaves the products
 * out: screens poll that while a sync runs and read the list once it's done.
 * ponytail: no pagination; fine for a few thousand variants, page it when catalogues grow past that.
 */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    // Screens poll this after "Sync now": start the queue if it stalled (as the other polled routes do).
    await kickIfDue().catch(() => {});
    const params = new URL(request.url).searchParams;
    const archived = params.get("archived") === "1";
    const where = { workspaceId: scope.workspaceId, brandId: scope.brandId };
    const [products, profile, found, running] = await Promise.all([
      params.get("status") === "1"
        ? null
        : prisma.product.findMany({ where: { ...where, archivedAt: archived ? { not: null } : null }, orderBy: { updatedAt: "desc" }, omit: { description: true } }),
      prisma.brandProfile.findFirst({ where, select: { catalogSync: true } }),
      catalogSource(where),
      catalogSyncRunning(where),
    ]);
    const status = { source: found.source, catalogSync: profile?.catalogSync ?? null, running };
    return Response.json(products ? { products: products.map(toProductListDto), ...status } : status);
  } catch (error) {
    return fromAccessError(error);
  }
}

/** Add a product by hand (MANUAL). Stock, prices and facts need rules.approve (VOUCHED_FIELDS). */
export async function POST(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "context.edit");
    if (scope instanceof Response) return scope;
    const body = ProductInput.safeParse(await request.json().catch(() => null));
    if (!body.success || !body.data.title) {
      return problemResponse({
        type: "https://api.brandpilot/errors/validation",
        title: "Invalid product",
        status: 400,
        detail: body.success ? "Give the product a name." : body.error.issues[0]?.message,
      });
    }
    if (vouchedIn(body.data).length && !(await effectivePermissions(scope.workspaceId, scope.userId, scope.brandId)).has("rules.approve")) return cannotVouch();
    const product = await prisma.product.create({
      data: { ...productData(body.data), title: body.data.title, workspaceId: scope.workspaceId, brandId: scope.brandId, source: "MANUAL" },
    });
    await prisma.auditEvent.create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "product.created", entityType: "Product", entityId: product.id, metadata: { source: "MANUAL" } },
    });
    return Response.json({ product: toProductDto(product) }, { status: 201 });
  } catch (error) {
    return fromAccessError(error);
  }
}
