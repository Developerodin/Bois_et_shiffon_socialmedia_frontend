import { z } from "zod";
import { invalid, workspaceHandler } from "@/server/api/workspace-route";
import { kickRunner } from "@/server/jobs/runner";
import { prisma } from "@/server/db/prisma";
import { createInvitation, inviteEmailStatuses } from "@/server/services/accounts";
import { listInvitations } from "@/server/services/workspace-admin";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

export const GET = workspaceHandler("invitations.manage", async (_req, { workspaceId }) => {
  const invitations = await listInvitations(workspaceId);
  const [emails, roles] = await Promise.all([
    inviteEmailStatuses(invitations.filter((i) => i.status === "PENDING")),
    // The invite dialog's role list: inviting doesn't require roles.read.
    prisma.role.findMany({
      where: { workspaceId, scope: "WORKSPACE" },
      orderBy: [{ isSystem: "desc" }, { createdAt: "asc" }],
      select: { id: true, slug: true, name: true },
    }),
  ]);
  return Response.json({
    invitations: invitations.map((i) => ({ ...i, emailStatus: emails.get(i.id) ?? null })),
    roles,
  });
});

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
