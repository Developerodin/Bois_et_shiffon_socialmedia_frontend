import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { PERSON_FIELDS, ProductInput, cannotVouch, productData, toProductDto, vouchedChanges, vouchedIn } from "@/server/catalog/products";
import { effectivePermissions } from "@/server/auth/permissions";
import { prisma } from "@/server/db/prisma";

type Params = BrandRouteParams & { productId: string };

const invalid = (detail?: string) => problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid product", status: 400, detail });
const notFound = () => problemResponse({ type: "https://api.brandpilot/errors/not-found", title: "Not found", status: 404 });

/** One product, with its description (the list leaves it out). */
export async function GET(request: Request, context: { params: Promise<Params> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const { productId } = await context.params;
    const product = await prisma.product.findFirst({ where: { id: productId, workspaceId: scope.workspaceId, brandId: scope.brandId } });
    return product ? Response.json({ product: toProductDto(product) }) : notFound();
  } catch (error) {
    return fromAccessError(error);
  }
}

/**
 * Edit a product. Synced rows take only the person-owned fields (the sync owns the rest); MANUAL rows take any.
 * Stock, prices and facts need rules.approve (VOUCHED_FIELDS), and the audit records their before and after.
 */
export async function PATCH(request: Request, context: { params: Promise<Params> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "context.edit");
    if (scope instanceof Response) return scope;
    const { productId } = await context.params;
    const body = ProductInput.safeParse(await request.json().catch(() => null));
    if (!body.success) return invalid(body.error.issues[0]?.message);
    const fields = Object.keys(body.data);
    if (!fields.length) return invalid();
    const where = { id: productId, workspaceId: scope.workspaceId, brandId: scope.brandId };
    const current = await prisma.product.findFirst({ where, omit: { description: true } });
    if (!current) return notFound();
    if (current.source !== "MANUAL" && fields.some((f) => !(PERSON_FIELDS as readonly string[]).includes(f))) {
      return invalid("This product comes from your store, so only materials, dimensions and certifications can be edited here.");
    }
    const vouched = vouchedIn(body.data);
    if (vouched.length && !(await effectivePermissions(scope.workspaceId, scope.userId, scope.brandId)).has("rules.approve")) return cannotVouch();
    await prisma.product.updateMany({ where, data: productData(body.data) });
    const product = await prisma.product.findFirst({ where });
    if (!product) return notFound();
    await prisma.auditEvent.create({
      data: {
        workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "product.updated", entityType: "Product", entityId: productId,
        metadata: { fields, ...(vouched.length && { changes: vouchedChanges(vouched, current, product) }) },
      },
    });
    return Response.json({ product: toProductDto(product) });
  } catch (error) {
    return fromAccessError(error);
  }
}

/** Delete a MANUAL product. A synced one would come back on the next sync, so it can't be deleted here. */
export async function DELETE(request: Request, context: { params: Promise<Params> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "context.edit");
    if (scope instanceof Response) return scope;
    const { productId } = await context.params;
    const where = { id: productId, workspaceId: scope.workspaceId, brandId: scope.brandId };
    const current = await prisma.product.findFirst({ where, select: { source: true } });
    if (!current) return notFound();
    if (current.source !== "MANUAL") return invalid("This product comes from your store and would come back on the next sync. Remove it there instead.");
    const { count } = await prisma.product.deleteMany({ where: { ...where, source: "MANUAL" } });
    if (!count) return notFound();
    await prisma.auditEvent.create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "product.deleted", entityType: "Product", entityId: productId, metadata: { source: "MANUAL" } },
    });
    return new Response(null, { status: 204 });
  } catch (error) {
    return fromAccessError(error);
  }
}
