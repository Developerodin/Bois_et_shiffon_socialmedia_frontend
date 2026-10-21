import { fromAccessError } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { listConnections, listProviders, toConnectionDto } from "@/server/services/connections";

/** Which channels can be connected (keys present) and what this brand has connected. */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const rows = await listConnections(scope.workspaceId, scope.brandId);
    return Response.json({ providers: listProviders(), connections: rows.map(toConnectionDto) });
  } catch (error) {
    return fromAccessError(error);
  }
}
