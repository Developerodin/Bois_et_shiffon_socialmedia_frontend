import { workspaceHandler } from "@/server/api/workspace-route";
import { transferPrimaryOwnership } from "@/server/services/workspace-admin";

type P = { workspaceId: string; memberId: string };

/** Hand primary ownership to this member (only the current primary owner may; checked in the service). */
export const POST = workspaceHandler<P>("members.read", async (_req, { workspaceId, userId }, { memberId }) => {
  await transferPrimaryOwnership(workspaceId, userId, memberId);
  return Response.json({ ok: true });
});
