import type { AdminWorkspaceHeader } from "@espanda/shared";
import { adminOnly, notFoundResponse, wire } from "@/server/api/admin-route";
import { prisma } from "@/server/db/prisma";

/** Platform admin → what the workspace pages' shared header and tab row show. */
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const ws = await prisma.workspace.findUnique({
    where: { id: (await context.params).workspaceId },
    select: { name: true, createdAt: true, owner: { select: { email: true } }, _count: { select: { members: true, brands: true, roles: true } } },
  });
  if (!ws) return notFoundResponse();
  return Response.json(wire(ws) satisfies AdminWorkspaceHeader);
}
