import { fromAccessError } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { prisma } from "@/server/db/prisma";

/** Ideas from the Opportunities agent: newest and best first, dismissed last. */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const rows = await prisma.opportunity.findMany({
      where: { workspaceId: scope.workspaceId, brandId: scope.brandId },
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 100,
    });
    return Response.json({ opportunities: rows });
  } catch (error) {
    return fromAccessError(error);
  }
}
