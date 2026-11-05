import { fromAccessError } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { requestCatalogSync } from "@/server/catalog/sync";
import { kickRunner } from "@/server/jobs/runner";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

/** "Sync now": queues a sync unless one is already queued or running (`queued: false`, a double click). */
export async function POST(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "context.edit");
    if (scope instanceof Response) return scope;
    const result = await requestCatalogSync(scope);
    kickRunner();
    return Response.json(result, { status: 202 });
  } catch (error) {
    return fromAccessError(error);
  }
}
