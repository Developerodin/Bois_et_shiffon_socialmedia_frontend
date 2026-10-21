import { invalid, workspaceHandler } from "@/server/api/workspace-route";
import { createRole, listRoles, RoleInput } from "@/server/services/workspace-admin";

export const GET = workspaceHandler("roles.read", async (_req, { workspaceId }) =>
  Response.json({ roles: await listRoles(workspaceId) }),
);

export const POST = workspaceHandler("roles.manage", async (req, { workspaceId, userId }) => {
  const body = RoleInput.safeParse(await req.json().catch(() => null));
  if (!body.success) return invalid(body.error.issues.map((i) => i.message).join("; "));
  await createRole(workspaceId, userId, body.data);
  return Response.json({ roles: await listRoles(workspaceId) }, { status: 201 });
});
