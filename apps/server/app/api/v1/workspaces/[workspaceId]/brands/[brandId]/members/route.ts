import { z } from "zod";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { fromAccessError } from "@/server/api/http-error";
import { accountErrorResponse, invalid } from "@/server/api/workspace-route";
import { kickRunner } from "@/server/jobs/runner";
import { prisma } from "@/server/db/prisma";
import { addToProject, listProjectPeople } from "@/server/services/project-members";

type Ctx = { params: Promise<BrandRouteParams> };

/** Who works on this project, plus the project roles to pick from. */
export async function GET(request: Request, context: Ctx) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const roles = await prisma.role.findMany({
      where: { workspaceId: scope.workspaceId, scope: "PROJECT" },
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
      select: { id: true, name: true, description: true },
    });
    return Response.json({ ...(await listProjectPeople(scope.workspaceId, scope.brandId)), roles });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}

export async function POST(request: Request, context: Ctx) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "project.members.manage");
    if (scope instanceof Response) return scope;
    const body = z.object({ email: z.string().trim().email(), roleId: z.string().min(1) }).safeParse(await request.json().catch(() => null));
    if (!body.success) return invalid("A valid email and role are required");
    const result = await addToProject({ ...scope, actorUserId: scope.userId, ...body.data });
    if (result.invited) kickRunner(); // sends the invitation email
    return Response.json(result, { status: 201 });
  } catch (error) {
    return accountErrorResponse(error) ?? fromAccessError(error);
  }
}
