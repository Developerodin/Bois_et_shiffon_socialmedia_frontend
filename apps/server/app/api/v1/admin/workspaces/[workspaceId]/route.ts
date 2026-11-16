import type { AdminWorkspaceDetail } from "@espanda/shared";
import { adminOnly, notFoundResponse, wire } from "@/server/api/admin-route";
import { workspaceDetail } from "@/server/services/platform-admin";

/** Platform admin → one workspace's people, projects, roles and invitations. Reading it records nothing: opening a workspace is POST .../visit. */
export async function GET(request: Request, context: { params: Promise<{ workspaceId: string }> }) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const d = await workspaceDetail((await context.params).workspaceId);
  if (!d) return notFoundResponse();
  return Response.json(wire(d) satisfies AdminWorkspaceDetail);
}
