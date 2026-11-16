import { z } from "zod";
import { invalid, workspaceHandler } from "@/server/api/workspace-route";
import { changeMemberRole, listMembers, removeMember } from "@/server/services/workspace-admin";

type P = { workspaceId: string; memberId: string };

export const PATCH = workspaceHandler<P>("members.manage", async (req, { workspaceId, userId }, { memberId }) => {
  const body = z.object({ roleId: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!body.success) return invalid("roleId is required");
  await changeMemberRole(workspaceId, userId, memberId, body.data.roleId);
  const member = (await listMembers(workspaceId)).find((m) => m.id === memberId);
  return Response.json({ member });
});

export const DELETE = workspaceHandler<P>("members.manage", async (_req, { workspaceId, userId }, { memberId }) => {
  await removeMember(workspaceId, userId, memberId);
  return new Response(null, { status: 204 });
});
