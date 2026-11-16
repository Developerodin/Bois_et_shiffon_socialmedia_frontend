import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import {
  confirmDoc,
  ContextDocConflictError,
  isContextDocKind,
  toDocDto,
} from "@/server/services/context-docs";

const Body = z.object({ version: z.number().int().positive() });

/** Human confirmation of the latest version — what agents then treat as brand truth. */
export async function POST(
  request: Request,
  context: { params: Promise<BrandRouteParams & { kind: string }> },
) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "context.confirm");
    if (scope instanceof Response) return scope;
    const { kind } = await context.params;
    if (!isContextDocKind(kind)) {
      return problemResponse({ type: "https://api.brandpilot/errors/not-found", title: "Unknown document", status: 404 });
    }
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 422 });
    }
    const doc = await confirmDoc({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      kind,
      version: body.data.version,
      userId: scope.userId,
    });
    return Response.json({ doc: toDocDto(doc) });
  } catch (error) {
    if (error instanceof ContextDocConflictError) {
      return problemResponse({ type: "https://api.brandpilot/errors/conflict", title: "Conflict", status: 409, detail: error.message });
    }
    return fromAccessError(error);
  }
}
