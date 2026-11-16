import { adminOnly, notFoundResponse } from "@/server/api/admin-route";
import { prisma } from "@/server/db/prisma";
import { recordWorkspaceView } from "@/server/services/platform-admin";

/** Platform admin → record that they opened this workspace, in its audit log (once per visit; the workspace layout calls it). */
export async function POST(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const { workspaceId } = await context.params;
  if (!(await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } }))) return notFoundResponse();
  await recordWorkspaceView(workspaceId, admin);
  return Response.json({ ok: true });
}
