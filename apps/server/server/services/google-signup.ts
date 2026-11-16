import { prisma } from "@/server/db/prisma";
import { ensurePersonalWorkspace, joinFromInvitation } from "@/server/services/accounts";

/**
 * Runs once when "Continue with Google" creates a new account (Google has verified the email).
 * Pending invitations for that email are accepted — the verified address proves the same thing
 * the emailed invite link does. Everyone also gets a workspace of their own as Owner.
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
      await joinFromInvitation(tx, inv, user.id);
      await tx.auditEvent.create({
        data: { workspaceId: inv.workspaceId, actorUserId: user.id, action: "invitation.accepted", entityType: "Invitation", entityId: inv.id, metadata: { via: "google" } },
      });
      joined++;
    }
    const own = await ensurePersonalWorkspace(tx, { ...user, email });
    return { joined, workspaceId: own?.id ?? null };
  });
}
