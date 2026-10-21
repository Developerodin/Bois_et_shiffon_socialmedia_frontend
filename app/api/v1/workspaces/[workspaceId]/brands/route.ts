import { auth } from "@/auth";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { assertWorkspaceHeaderMatchesPath } from "@/server/api/workspace-headers";
import { requireWorkspaceMember } from "@/server/auth/access";
import { kickRunner } from "@/server/jobs/runner";
import { listAccessibleBrands } from "@/server/services/brands";
import { CreateBrandInput, createBrandWithResearch } from "@/server/services/create-brand";

type RouteContext = { params: Promise<{ workspaceId: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return problemResponse({
      type: "https://api.brandpilot/errors/unauthorized",
      title: "Unauthorized",
      status: 401,
    });
  }

  const { workspaceId } = await context.params;
  const headerWorkspaceId = request.headers.get("X-Workspace-Id");

  try {
    assertWorkspaceHeaderMatchesPath(workspaceId, headerWorkspaceId);
    await requireWorkspaceMember(workspaceId, session.user.id);
    const brands = await listAccessibleBrands(workspaceId, session.user.id);
    return Response.json({ brands });
  } catch (error) {
    return fromAccessError(error);
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user?.id) {
    return problemResponse({
      type: "https://api.brandpilot/errors/unauthorized",
      title: "Unauthorized",
      status: 401,
    });
  }

  const { workspaceId } = await context.params;
  const parsed = CreateBrandInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return problemResponse({
      type: "https://api.brandpilot/errors/validation",
      title: "Invalid brand",
      status: 422,
      detail: parsed.error.issues.map((i) => i.message).join("; "),
    });
  }

  try {
    assertWorkspaceHeaderMatchesPath(workspaceId, request.headers.get("X-Workspace-Id"));
    const { brand, researchRunId } = await createBrandWithResearch(
      workspaceId,
      session.user.id,
      parsed.data,
    );
    kickRunner();
    return Response.json(
      { brand: { id: brand.id, slug: brand.slug, displayName: brand.displayName }, researchRunId },
      { status: 201 },
    );
  } catch (error) {
    return fromAccessError(error);
  }
}
