import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { PublishingError } from "@/server/services/publishing";
import { verifyUpload } from "@/server/stories/uploads";

/** The phone has finished its PUT: check the file. A refused file comes back as { status: "REJECTED", reason, code }. */
export async function POST(request: Request, context: { params: Promise<BrandRouteParams & { uploadId: string }> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    const { uploadId } = await context.params;
    return Response.json(await verifyUpload(scope, uploadId));
  } catch (error) {
    if (error instanceof PublishingError) return problemResponse({ type: "https://api.brandpilot/errors/publishing", title: error.message, status: error.status, detail: error.message, code: error.code });
    return fromAccessError(error);
  }
}
