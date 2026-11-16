import { workspaceHandler } from "@/server/api/workspace-route";
import { revokeInvitation } from "@/server/services/workspace-admin";

type P = { workspaceId: string; invitationId: string };

export const DELETE = workspaceHandler<P>("invitations.manage", async (_req, { workspaceId, userId }, { invitationId }) => {
  await revokeInvitation(workspaceId, userId, invitationId);
  return new Response(null, { status: 204 });
});
