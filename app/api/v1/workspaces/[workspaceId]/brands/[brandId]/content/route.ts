import { fromAccessError } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { prisma } from "@/server/db/prisma";

/** Calendar items with their latest draft and its latest quality check. */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const rows = await prisma.contentItem.findMany({
      where: { workspaceId: scope.workspaceId, brandId: scope.brandId, status: { not: "CANCELLED" } },
      orderBy: [{ scheduledFor: "asc" }, { createdAt: "asc" }],
      take: 200,
      include: {
        opportunity: { select: { title: true } },
        versions: { orderBy: { version: "desc" }, take: 1, include: { checks: { orderBy: { createdAt: "desc" }, take: 1 } } },
      },
    });
    return Response.json({
      items: rows.map(({ versions, ...i }) => ({
        ...i,
        latest: versions[0] ? { version: versions[0].version, body: versions[0].body, createdAt: versions[0].createdAt, check: versions[0].checks[0] ?? null } : null,
      })),
    });
  } catch (error) {
    return fromAccessError(error);
  }
}
