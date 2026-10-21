import { randomBytes } from "node:crypto";
import { ensureSystemRoles } from "@/server/auth/permissions";
import { prisma } from "@/server/db/prisma";

/**
 * Runs once when "Continue with Google" creates a new account (Google has verified the email).
 * Pending invitations for that email are accepted — the verified address proves the same thing
 * the emailed invite link does. With no invitation, the person gets their own workspace as Owner
 * and lands on the first-run website page.
 * ponytail: open sign-up means anyone with a Google account can create a workspace and run agents
 * (OpenAI cost). Add an allow-list, waitlist or per-workspace run quota before a public launch.
 */
export async function provisionGoogleUser(user: { id: string; email: string; name?: string | null }) {
  const email = user.email.trim().toLowerCase();
  return prisma.$transaction(async (tx) => {
    const invites = await tx.invitation.findMany({
      where: { email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    let joined = 0;
    for (const inv of invites) {
      const claimed = await tx.invitation.updateMany({
        where: { id: inv.id, acceptedAt: null, revokedAt: null },
        data: { acceptedAt: new Date() },
      });
      if (claimed.count !== 1) continue; // accepted concurrently elsewhere
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId: user.id } },
        update: { roleId: inv.roleId },
        create: { workspaceId: inv.workspaceId, userId: user.id, roleId: inv.roleId },
      });
      await tx.auditEvent.create({
        data: { workspaceId: inv.workspaceId, actorUserId: user.id, action: "invitation.accepted", entityType: "Invitation", entityId: inv.id, metadata: { via: "google" } },
      });
      joined++;
    }
    if (joined > 0) return { joined, workspaceId: null };

    const first = (user.name ?? email.split("@")[0]).trim().split(/\s+/)[0] || "My";
    const workspace = await tx.workspace.create({
      data: { name: `${first}'s workspace`, slug: `ws-${randomBytes(5).toString("hex")}` },
    });
    await ensureSystemRoles(workspace.id, tx);
    const owner = await tx.role.findUniqueOrThrow({ where: { workspaceId_slug: { workspaceId: workspace.id, slug: "owner" } } });
    await tx.workspaceMember.create({
      data: { workspaceId: workspace.id, userId: user.id, role: "OWNER", roleId: owner.id },
    });
    await tx.auditEvent.create({
      data: { workspaceId: workspace.id, actorUserId: user.id, action: "workspace.created", entityType: "Workspace", entityId: workspace.id, metadata: { via: "google-signup" } },
    });
    return { joined: 0, workspaceId: workspace.id };
  });
}
