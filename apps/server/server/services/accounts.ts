import { randomBytes } from "node:crypto";
import type { EmailStatus, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { memberRole } from "@/server/auth/permissions";
import { SYSTEM_ROLES } from "@/server/auth/permissions.catalog";
import { hitRateLimit, limitKey, resetRateLimit } from "@/server/auth/rate-limit";
import { appUrl, hashToken, MIN_PASSWORD_LENGTH, newToken } from "@/server/auth/tokens";
import { prisma } from "@/server/db/prisma";
import { queueEmail } from "@/server/email/outbox";

/** Invitations + password reset (ported from Cad auth: hashed single-use tokens, rate limits). */
export class AccountFlowError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409 | 429,
  ) {
    super(message);
    this.name = "AccountFlowError";
  }
}

const INVITE_TTL_MS = 7 * 24 * 60 * 60_000;
const RESET_TTL_MS = 60 * 60_000;
export const Password = z.string().min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`).max(200);
const normEmail = (e: string) => e.trim().toLowerCase();

// ---------- invitations ----------

export async function createInvitation(input: {
  workspaceId: string;
  /** Project invite: the role is a PROJECT role on this brand; the person joins the workspace as Member. */
  brandId?: string;
  email: string;
  roleId: string;
  invitedByUserId: string;
}) {
  const email = normEmail(input.email);
  const role = await prisma.role.findFirst({
    where: { id: input.roleId, workspaceId: input.workspaceId, scope: input.brandId ? "PROJECT" : "WORKSPACE" },
  });
  if (!role) throw new AccountFlowError(input.brandId ? "Pick a project role" : "Pick a workspace role", 404);
  const brand = input.brandId
    ? await prisma.brand.findFirst({ where: { id: input.brandId, workspaceId: input.workspaceId } })
    : null;
  if (input.brandId && !brand) throw new AccountFlowError("Project not found in this workspace", 404);
  // Same rule as changing roles: only an owner can make someone an owner (else an admin could invite
  // their own second address as owner and take over the workspace).
  if (role.slug === "owner" && (await memberRole(input.workspaceId, input.invitedByUserId))?.role?.slug !== "owner") {
    throw new AccountFlowError("Only owners can invite another owner", 409);
  }
  const already = await prisma.workspaceMember.findFirst({
    where: { workspaceId: input.workspaceId, user: { email } },
  });
  if (already) throw new AccountFlowError("This person is already a member", 409);

  const token = newToken();
  const workspace = await prisma.workspace.findUniqueOrThrow({ where: { id: input.workspaceId } });
  const inviteUrl = appUrl(`/invite/${token.raw}`);
  return prisma.$transaction(async (tx) => {
    // A new invite replaces any pending one for the same email and project.
    await tx.invitation.updateMany({
      where: { workspaceId: input.workspaceId, brandId: input.brandId ?? null, email, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    const invitation = await tx.invitation.create({
      data: {
        workspaceId: input.workspaceId,
        email,
        roleId: role.id,
        brandId: input.brandId,
        tokenHash: token.hash,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
        invitedByUserId: input.invitedByUserId,
      },
      include: { role: true },
    });
    const where = brand ? `${brand.displayName} (in ${workspace.name})` : workspace.name;
    const emailDelivery = await queueEmail(tx, {
      to: email,
      subject: `You're invited to ${brand?.displayName ?? workspace.name}`,
      text: `You've been invited to work on ${where} as ${role.name}.\n\nAccept the invitation: ${inviteUrl}\n\nThis link expires in 7 days.`,
    });
    await tx.auditEvent.create({
      data: {
        workspaceId: input.workspaceId,
        actorUserId: input.invitedByUserId,
        action: "invitation.created",
        entityType: "Invitation",
        entityId: invitation.id,
        metadata: { email, roleId: role.id, brandId: input.brandId ?? null },
      },
    });
    return { invitation, inviteUrl, emailDelivery };
  });
}

/**
 * Latest invite email per invitation. Outbox rows don't reference invitations, so match by
 * recipient + invite subject + sent no earlier than the invitation.
 * ponytail: two pending invites to one address (workspace + a project) can show each other's status;
 * add EmailOutbox.invitationId if that matters.
 */
export async function inviteEmailStatuses(invitations: { id: string; email: string; createdAt: string }[]) {
  if (!invitations.length) return new Map<string, EmailStatus>();
  const since = new Date(Math.min(...invitations.map((i) => Date.parse(i.createdAt))));
  const rows = await prisma.emailOutbox.findMany({
    where: { to: { in: [...new Set(invitations.map((i) => i.email))] }, subject: { startsWith: "You're invited" }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    select: { to: true, status: true, createdAt: true },
  });
  return new Map(
    invitations.flatMap((i) => {
      const row = rows.find((r) => r.to === i.email && r.createdAt.getTime() >= Date.parse(i.createdAt) - 1000);
      return row ? [[i.id, row.status] as const] : [];
    }),
  );
}

async function findOpenInvitation(rawToken: string) {
  const inv = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(rawToken) },
    include: { workspace: true, role: true, brand: { select: { displayName: true } } },
  });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) {
    throw new AccountFlowError("This invitation is invalid or has expired", 404);
  }
  return inv;
}

export async function previewInvitation(rawToken: string) {
  const inv = await findOpenInvitation(rawToken);
  const user = await prisma.user.findUnique({ where: { email: inv.email } });
  return {
    email: inv.email,
    workspaceName: inv.workspace.name,
    projectName: inv.brand?.displayName ?? null,
    roleName: inv.role.name,
    expiresAt: inv.expiresAt.toISOString(),
    // Any active account counts, password or Google-only: they accept, then sign in the way they already do.
    existingAccount: user?.status === "ACTIVE",
  };
}

export async function acceptInvitation(input: { token: string; name?: string; password?: string }) {
  const inv = await findOpenInvitation(input.token);
  const existing = await prisma.user.findUnique({ where: { email: inv.email } });
  const needsPassword = existing?.status !== "ACTIVE";
  if (needsPassword) {
    const parsed = Password.safeParse(input.password ?? "");
    if (!parsed.success) throw new AccountFlowError(parsed.error.issues[0].message, 400);
  }
  if (existing?.status === "DISABLED") throw new AccountFlowError("This account is disabled", 409);
  const passwordHash = needsPassword ? await bcrypt.hash(input.password!, 12) : undefined;

  await prisma.$transaction(async (tx) => {
    // Single use: only the first concurrent accept flips acceptedAt.
    const claimed = await tx.invitation.updateMany({
      where: { id: inv.id, acceptedAt: null, revokedAt: null },
      data: { acceptedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AccountFlowError("This invitation was already used", 409);
    const user = await tx.user.upsert({
      where: { email: inv.email },
      update: needsPassword
        ? { passwordHash, status: "ACTIVE", name: input.name || undefined, sessionVersion: { increment: 1 } }
        : {},
      create: { email: inv.email, name: input.name || null, passwordHash, status: "ACTIVE" },
    });
    await joinFromInvitation(tx, inv, user.id);
    await ensurePersonalWorkspace(tx, user);
    await tx.auditEvent.create({
      data: {
        workspaceId: inv.workspaceId,
        actorUserId: user.id,
        action: "invitation.accepted",
        entityType: "Invitation",
        entityId: inv.id,
      },
    });
  });
  return { workspaceId: inv.workspaceId, brandId: inv.brandId };
}

type Tx = Prisma.TransactionClient;

/** Workspace invite: the invited workspace role. Project invite: Member (never a downgrade) + the project role. */
export async function joinFromInvitation(tx: Tx, inv: { workspaceId: string; roleId: string; brandId: string | null }, userId: string) {
  if (!inv.brandId) {
    await tx.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId } },
      update: { roleId: inv.roleId },
      create: { workspaceId: inv.workspaceId, userId, roleId: inv.roleId },
    });
    return;
  }
  const member = await tx.role.findUniqueOrThrow({ where: { workspaceId_slug: { workspaceId: inv.workspaceId, slug: "member" } } });
  await tx.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: inv.workspaceId, userId } },
    update: {},
    create: { workspaceId: inv.workspaceId, userId, role: "VIEWER", roleId: member.id },
  });
  await tx.brandMember.upsert({
    where: { brandId_userId: { brandId: inv.brandId, userId } },
    update: { roleId: inv.roleId },
    create: { workspaceId: inv.workspaceId, brandId: inv.brandId, userId, roleId: inv.roleId },
  });
}

/** Everyone owns a workspace of their own to add projects to, invited or not. */
export async function ensurePersonalWorkspace(tx: Tx, user: { id: string; email: string; name?: string | null }) {
  const owns = await tx.workspaceMember.findFirst({ where: { userId: user.id, roleRef: { slug: "owner" } } });
  if (owns) return null;
  const first = (user.name ?? user.email.split("@")[0]).trim().split(/\s+/)[0] || "My";
  const workspace = await tx.workspace.create({
    data: { name: `${first}'s workspace`, slug: `ws-${randomBytes(5).toString("hex")}`, ownerUserId: user.id },
  });
  // New workspace: one insert for its system roles (upserting each one overruns the transaction timeout on Neon).
  await tx.role.createMany({ data: SYSTEM_ROLES.map((r) => ({ ...r, workspaceId: workspace.id, isSystem: true })) });
  const owner = await tx.role.findUniqueOrThrow({ where: { workspaceId_slug: { workspaceId: workspace.id, slug: "owner" } } });
  await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER", roleId: owner.id } });
  await tx.auditEvent.create({
    data: { workspaceId: workspace.id, actorUserId: user.id, action: "workspace.created", entityType: "Workspace", entityId: workspace.id },
  });
  return workspace;
}

// ---------- password reset ----------

export async function requestPasswordReset(emailRaw: string, ip: string) {
  const email = normEmail(emailRaw);
  const [byEmail, byIp] = await Promise.all([
    hitRateLimit(limitKey("forgot:email", email), 3, 60 * 60_000),
    hitRateLimit(limitKey("forgot:ip", ip), 20, 60 * 60_000),
  ]);
  if (!byEmail.allowed || !byIp.allowed) throw new AccountFlowError("Too many requests", 429);

  const user = await prisma.user.findUnique({ where: { email } });
  // Same response whether or not the account exists (no enumeration).
  if (!user || user.status !== "ACTIVE" || user.deletedAt) return;
  const token = newToken();
  const link = appUrl(`/reset-password?token=${token.raw}`);
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() }, // older links stop working
    });
    await tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: token.hash, expiresAt: new Date(Date.now() + RESET_TTL_MS) },
    });
    await queueEmail(tx, {
      to: email,
      subject: "Reset your password",
      text: `Someone asked to reset the password for this account.\n\nReset it here (valid for 1 hour): ${link}\n\nIf it wasn't you, ignore this email.`,
    });
    await tx.auditEvent.create({
      data: { actorUserId: user.id, action: "password.reset_requested", entityType: "User", entityId: user.id },
    });
  });
}

export async function resetPassword(rawToken: string, password: string) {
  const parsed = Password.safeParse(password);
  if (!parsed.success) throw new AccountFlowError(parsed.error.issues[0].message, 400);
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hashToken(rawToken) } });
  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new AccountFlowError("This reset link is invalid or has expired", 400);
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const user = await prisma.$transaction(async (tx) => {
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AccountFlowError("This reset link was already used", 400);
    const u = await tx.user.update({
      where: { id: row.userId },
      // sessionVersion bump signs the user out everywhere
      data: { passwordHash, sessionVersion: { increment: 1 } },
    });
    await tx.auditEvent.create({
      data: { actorUserId: u.id, action: "password.reset", entityType: "User", entityId: u.id },
    });
    return u;
  });
  await resetRateLimit(limitKey("login:email", user.email));
}
