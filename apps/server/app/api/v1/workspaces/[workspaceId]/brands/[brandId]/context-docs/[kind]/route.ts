import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import {
  ContextDocConflictError,
  isContextDocKind,
  saveDraft,
  toDocDto,
} from "@/server/services/context-docs";

const Body = z.object({
  markdown: z.string().trim().min(1).max(100_000),
  baseVersion: z.number().int().positive().nullable(),
});

/** Human edit → new DRAFT version (never mutates a confirmed version). */
export async function PUT(
  request: Request,
  context: { params: Promise<BrandRouteParams & { kind: string }> },
) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "context.edit");
    if (scope instanceof Response) return scope;
    const { kind } = await context.params;
    if (!isContextDocKind(kind)) {
      return problemResponse({ type: "https://api.brandpilot/errors/not-found", title: "Unknown document", status: 404 });
    }
    const body = Body.safeParse(await request.json().catch(() => null));
    if (!body.success) {
      return problemResponse({
        type: "https://api.brandpilot/errors/validation",
        title: "Invalid document",
        status: 422,
        detail: body.error.issues.map((i) => i.message).join("; "),
      });
    }
    const doc = await saveDraft({
      workspaceId: scope.workspaceId,
      brandId: scope.brandId,
      kind,
      markdown: body.data.markdown,
      baseVersion: body.data.baseVersion,
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
