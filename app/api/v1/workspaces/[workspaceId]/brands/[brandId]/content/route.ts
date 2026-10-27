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
        decisions: { orderBy: { createdAt: "desc" }, take: 1, select: { verdict: true, note: true, contentVersionId: true } },
        publications: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, error: true } },
      },
    });
    return Response.json({
      items: rows.map(({ versions, decisions, publications, ...i }) => ({
        ...i,
        // The last publish went wrong: "FAILED" (back to Approved, reason in publishError) or "CHECK" (may have posted).
        publishIssue: publications[0]?.status === "PENDING_VERIFY" ? "CHECK" : publications[0]?.status === "FAILED" && i.status === "APPROVED" ? "FAILED" : null,
        publishError: publications[0]?.status === "FAILED" || publications[0]?.status === "PENDING_VERIFY" ? publications[0].error : null,
        latest: versions[0]
          ? {
              version: versions[0].version,
              body: versions[0].body,
              createdAt: versions[0].createdAt,
              byPerson: versions[0].createdBy !== "agent",
              check: versions[0].checks[0] ?? null,
              // The approver's last word on this exact draft (e.g. the changes they asked for).
              review: decisions[0]?.contentVersionId === versions[0].id ? { verdict: decisions[0].verdict, note: decisions[0].note } : null,
            }
          : null,
      })),
    });
  } catch (error) {
    return fromAccessError(error);
  }
}
