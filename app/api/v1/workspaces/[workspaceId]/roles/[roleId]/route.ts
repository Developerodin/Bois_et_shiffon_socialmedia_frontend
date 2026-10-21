import { invalid, workspaceHandler } from "@/server/api/workspace-route";
import { deleteRole, RoleInput, updateRole } from "@/server/services/workspace-admin";

type P = { workspaceId: string; roleId: string };

export const PATCH = workspaceHandler<P>("roles.manage", async (req, { workspaceId, userId }, { roleId }) => {
  const body = RoleInput.partial().safeParse(await req.json().catch(() => null));
  if (!body.success) return invalid(body.error.issues.map((i) => i.message).join("; "));
  const role = await updateRole(workspaceId, userId, roleId, body.data);
  return Response.json({ role });
});

export const DELETE = workspaceHandler<P>("roles.manage", async (_req, { workspaceId, userId }, { roleId }) => {
  await deleteRole(workspaceId, userId, roleId);
  return new Response(null, { status: 204 });
});
