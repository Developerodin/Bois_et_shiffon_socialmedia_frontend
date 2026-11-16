import { fromAccessError } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { latestAuditReports, toAuditDto } from "@/server/services/audit-reports";

/** Latest SEO and GEO reports for the Performance page. */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "analytics.read");
    if (scope instanceof Response) return scope;
    const { seo, geo } = await latestAuditReports(scope.workspaceId, scope.brandId);
    return Response.json({ seo: toAuditDto(seo), geo: toAuditDto(geo) });
  } catch (error) {
    return fromAccessError(error);
  }
}
