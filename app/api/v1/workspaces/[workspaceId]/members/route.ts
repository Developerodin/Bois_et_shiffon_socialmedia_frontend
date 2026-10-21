import { workspaceHandler } from "@/server/api/workspace-route";
import { listMembers } from "@/server/services/workspace-admin";

export const GET = workspaceHandler("members.read", async (_req, { workspaceId }) =>
  Response.json({ members: await listMembers(workspaceId) }),
);
