import { z } from "zod";
import { invalid, workspaceHandler } from "@/server/api/workspace-route";
import { kickRunner } from "@/server/jobs/runner";
import { createInvitation } from "@/server/services/accounts";
import { listInvitations } from "@/server/services/workspace-admin";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

export const GET = workspaceHandler("invitations.manage", async (_req, { workspaceId }) =>
  Response.json({ invitations: await listInvitations(workspaceId) }),
);

export const POST = workspaceHandler("invitations.manage", async (req, { workspaceId, userId }) => {
  const body = z
    .object({ email: z.string().trim().email(), roleId: z.string().min(1) })
    .safeParse(await req.json().catch(() => null));
  if (!body.success) return invalid("A valid email and role are required");
  const { invitation, inviteUrl, emailDelivery } = await createInvitation({
    workspaceId,
    email: body.data.email,
    roleId: body.data.roleId,
    invitedByUserId: userId,
  });
  kickRunner();
  const listed = (await listInvitations(workspaceId)).find((i) => i.id === invitation.id);
  return Response.json({ invitation: listed, inviteUrl, emailDelivery }, { status: 201 });
});
