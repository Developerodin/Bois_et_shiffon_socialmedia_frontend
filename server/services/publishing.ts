import { createHash } from "node:crypto";
import type { ApprovalVerdict, ContentChannel, IntegrationProvider, Prisma } from "@prisma/client";
import { decryptCredentials } from "@/server/crypto/credentials";
import { prisma } from "@/server/db/prisma";
import { PUBLISHERS, PublishRefused } from "@/server/integrations/publishers";
import { enqueueJob } from "@/server/jobs/queue";
import { safeHttpUrl } from "@/lib/website";

/**
 * Approval → publishing (design §6 "sealed package", DEC-015/016). Rules:
 * - An approval binds to one ContentVersion and the sha256 of exactly what will be posted.
 *   A newer draft voids it; publishing re-checks at the moment of posting.
 * - Decisions are append-only. Creator ≠ approver.
 * - One live attempt per (version, account). A platform refusal is FAILED (retry allowed); a
 *   timeout or 5xx is PENDING_VERIFY and is never retried blindly: a person checks the account.
 */
export const PUBLISH_JOB = "content.publish";

export class PublishingError extends Error {
  constructor(message: string, readonly status = 409) {
    super(message);
  }
}

type Body = { hook?: string; caption?: string; hashtags?: string[]; pinTitle?: string; altText?: string };

const CHANNEL_PROVIDER: Record<ContentChannel, IntegrationProvider | null> = {
  FACEBOOK_POST: "META",
  INSTAGRAM_POST: "INSTAGRAM",
  THREADS_POST: "THREADS",
  PINTEREST_PIN: "PINTEREST",
  INSTAGRAM_CAROUSEL: null, // ponytail: needs several images; post these from Instagram until drafts carry media
  INSTAGRAM_REEL: null, // needs a rendered video
};
const NEEDS_IMAGE: ContentChannel[] = ["INSTAGRAM_POST", "PINTEREST_PIN"];
const TEXT_LIMIT: Partial<Record<ContentChannel, number>> = { THREADS_POST: 500, INSTAGRAM_POST: 2200 };
const LIVE: Prisma.EnumPublicationStatusFilter = { in: ["SCHEDULED", "PUBLISHING", "PUBLISHED", "PENDING_VERIFY"] };

export function publishRequirements(channel: ContentChannel) {
  return { provider: CHANNEL_PROVIDER[channel], needsImage: NEEDS_IMAGE.includes(channel), needsBoard: channel === "PINTEREST_PIN" };
}

export function postText(body: Body) {
  return [body.caption?.trim(), body.hashtags?.length ? body.hashtags.join(" ") : ""].filter(Boolean).join("\n\n");
}

export function packageHash(item: { id: string; channel: string }, version: { id: string; body: unknown }) {
  return createHash("sha256").update(JSON.stringify([item.id, item.channel, version.id, version.body])).digest("hex");
}

async function loadItem(scope: { workspaceId: string; brandId: string }, itemId: string, db: Prisma.TransactionClient = prisma) {
  const item = await db.contentItem.findFirst({
    where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId },
    include: { versions: { orderBy: { version: "desc" }, take: 1, include: { checks: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  });
  if (!item) throw new PublishingError("Post not found", 404);
  return { item, latest: item.versions[0] ?? null };
}

/** The approval that currently lets this post go out, or null. */
async function currentApproval(itemId: string, latest: { id: string; body: unknown } | null, channel: string, db: Prisma.TransactionClient = prisma) {
  if (!latest) return null;
  const last = await db.approvalDecision.findFirst({ where: { contentItemId: itemId }, orderBy: { createdAt: "desc" } });
  const ok = last?.verdict === "APPROVED" && last.contentVersionId === latest.id && last.packageHash === packageHash({ id: itemId, channel }, latest);
  return ok ? last : null;
}

// Callers queue on the per-post lock; allow for a slow database link before giving up.
export const TX = { maxWait: 10_000, timeout: 20_000 };
/** Per-post lock shared by people (edit, approve, publish) and agents (Creator, Quality). */
export const lock = (tx: Prisma.TransactionClient, itemId: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`content:${itemId}`}))`;

export type DraftInput = { hook: string; caption: string; hashtags: string[]; slides: string[]; script: string[]; pinTitle: string; altText: string };
// A person can edit until the post is handed to a platform; a scheduled post must be cancelled first.
const EDITABLE = ["PLANNED", "BRIEF_READY", "DRAFT_REVIEW", "AWAITING_APPROVAL", "APPROVED", "REJECTED", "BLOCKED"];

/**
 * A person saves a draft: always a new immutable version (any approval of the old one stops
 * holding), back to draft review for the Quality check. The editor can't approve it themselves.
 * `version` is the one they edited (0 when writing the first draft); a newer one means they'd overwrite it.
 */
export async function saveDraft(input: { workspaceId: string; brandId: string; userId: string; itemId: string; version: number; body: DraftInput }) {
  const body: DraftInput = {
    hook: input.body.hook.trim(),
    caption: input.body.caption.trim(),
    hashtags: [...new Set(input.body.hashtags.map((h) => h.trim().replace(/^#*/, "")).filter(Boolean).map((h) => `#${h}`))],
    slides: input.body.slides.map((s) => s.trim()).filter(Boolean),
    script: input.body.script.map((s) => s.trim()).filter(Boolean),
    pinTitle: input.body.pinTitle.trim(),
    altText: input.body.altText.trim(),
  };
  if (!body.caption) throw new PublishingError("The caption can't be empty", 400);
  return prisma.$transaction(async (tx) => {
    await lock(tx, input.itemId);
    const { item, latest } = await loadItem(input, input.itemId, tx);
    if ((latest?.version ?? 0) !== input.version) throw new PublishingError("Someone saved a newer draft while you were editing. Copy your changes, reload and try again.");
    if (item.status === "SCHEDULED") throw new PublishingError("This post is scheduled. Cancel it first, then edit.");
    if (!EDITABLE.includes(item.status)) throw new PublishingError("A published post can't be edited");
    if (latest && JSON.stringify({ ...(latest.body as object), ...body }) === JSON.stringify(latest.body)) throw new PublishingError("Nothing changed", 400);
    const version = await tx.contentVersion.create({
      data: { contentItemId: item.id, version: (latest?.version ?? 0) + 1, body, createdBy: input.userId },
    });
    await tx.contentItem.update({ where: { id: item.id }, data: { status: "DRAFT_REVIEW" } });
    await tx.auditEvent.create({
      data: {
        workspaceId: input.workspaceId, brandId: input.brandId, actorUserId: input.userId,
        action: "content.edit", entityType: "ContentItem", entityId: item.id, metadata: { version: version.version, from: item.status },
      },
    });
    return version;
  }, TX);
}

export async function decide(input: {
  workspaceId: string;
  brandId: string;
  userId: string;
  itemId: string;
  version: number; // the version the approver was looking at
  verdict: ApprovalVerdict;
  note?: string;
}) {
  const note = input.note?.trim() || null;
  if (input.verdict !== "APPROVED" && !note) throw new PublishingError("Say what needs to change", 400);
  return prisma.$transaction(async (tx) => {
    await lock(tx, input.itemId);
    const { item, latest } = await loadItem(input, input.itemId, tx);
    if (!latest || latest.version !== input.version) throw new PublishingError("A newer draft exists. Review the latest version.");
    if (item.status !== "AWAITING_APPROVAL") throw new PublishingError("This post isn't waiting for approval");
    if (input.verdict === "APPROVED") {
      if (latest.checks[0]?.overall === "BLOCKER" || !latest.checks[0]) throw new PublishingError("The quality check must pass before approval");
      if (latest.createdBy === input.userId) throw new PublishingError("You wrote this draft, so someone else has to approve it", 403);
    }
    const decision = await tx.approvalDecision.create({
      data: {
        workspaceId: input.workspaceId,
        brandId: input.brandId,
        contentItemId: item.id,
        contentVersionId: latest.id,
        packageHash: packageHash(item, latest),
        verdict: input.verdict,
        note,
        userId: input.userId,
      },
    });
    const status = input.verdict === "APPROVED" ? "APPROVED" : input.verdict === "REJECTED" ? "REJECTED" : "DRAFT_REVIEW";
    await tx.contentItem.update({ where: { id: item.id }, data: { status } });
    await tx.auditEvent.create({
      data: {
        workspaceId: input.workspaceId, brandId: input.brandId, actorUserId: input.userId,
        action: `content.${input.verdict.toLowerCase()}`, entityType: "ContentItem", entityId: item.id,
        metadata: { version: latest.version, packageHash: decision.packageHash },
      },
    });
    return decision;
  }, TX);
}

export async function schedulePublication(input: {
  workspaceId: string;
  brandId: string;
  userId: string;
  itemId: string;
  version: number;
  connectionId: string;
  boardId?: string;
  imageUrl?: string;
  runAt?: Date; // omitted = now
}) {
  const runAt = input.runAt ?? new Date();
  if (runAt.getTime() < Date.now() - 60_000) throw new PublishingError("Pick a time in the future", 400);
  const attempt = await prisma.$transaction(async (tx) => {
    await lock(tx, input.itemId);
    const { item, latest } = await loadItem(input, input.itemId, tx);
    if (!latest || latest.version !== input.version) throw new PublishingError("A newer draft exists. It needs approval first.");
    const approval = await currentApproval(item.id, latest, item.channel, tx);
    if (item.status === "SCHEDULED") throw new PublishingError("Already scheduled. Cancel it first to change the time or account.");
    if (item.status === "PUBLISHED") throw new PublishingError("Already published");
    if (!approval || item.status !== "APPROVED") throw new PublishingError("Only an approved version can be published");

    const req = publishRequirements(item.channel);
    if (!req.provider) throw new PublishingError("This format can't be published automatically yet. Export it and post it in the app.", 400);
    const conn = await tx.integrationConnection.findFirst({
      where: { id: input.connectionId, brandId: input.brandId, provider: req.provider, status: "ACTIVE" },
    });
    if (!conn) throw new PublishingError("Choose a connected account for this channel", 400);
    const imageUrl = input.imageUrl?.trim() ? safeHttpUrl(input.imageUrl.trim())?.href ?? null : null;
    if (input.imageUrl?.trim() && (!imageUrl || !imageUrl.startsWith("https://"))) throw new PublishingError("The image link must be a public https:// address", 400);
    if (req.needsImage && !imageUrl) throw new PublishingError("This channel needs an image", 400);
    if (req.needsBoard && !input.boardId) throw new PublishingError("Choose a board", 400);
    const limit = TEXT_LIMIT[item.channel];
    if (limit && postText(latest.body as Body).length > limit) throw new PublishingError(`The text is over this channel's ${limit}-character limit`, 400);

    const live = await tx.publicationAttempt.findFirst({ where: { contentVersionId: latest.id, connectionId: conn.id, status: LIVE } });
    if (live) throw new PublishingError(live.status === "PUBLISHED" ? "Already published to this account" : "Already scheduled for this account");

    const a = await tx.publicationAttempt.create({
      data: {
        workspaceId: input.workspaceId, brandId: input.brandId, contentItemId: item.id, contentVersionId: latest.id,
        packageHash: approval.packageHash, connectionId: conn.id, provider: conn.provider,
        target: { boardId: input.boardId ?? null, imageUrl }, runAt, createdByUserId: input.userId,
      },
    });
    await tx.contentItem.update({ where: { id: item.id }, data: { status: "SCHEDULED", scheduledFor: runAt } });
    await enqueueJob({ type: PUBLISH_JOB, workspaceId: input.workspaceId, brandId: input.brandId, payload: { attemptId: a.id }, runAt, maxAttempts: 1, idempotencyKey: `publish:${a.id}` }, tx);
    return a;
  }, TX);
  return attempt;
}

/** Job handler. Never throws: a retry could double-post, so every outcome is recorded instead. */
export async function executePublication(payload: unknown) {
  const { attemptId } = payload as { attemptId: string };
  const claimed = await prisma.publicationAttempt.updateMany({ where: { id: attemptId, status: "SCHEDULED" }, data: { status: "PUBLISHING" } });
  if (claimed.count !== 1) return; // cancelled, or already handled
  const a = await prisma.publicationAttempt.findUniqueOrThrow({ where: { id: attemptId } });
  const finish = (status: "PUBLISHED" | "FAILED" | "PENDING_VERIFY", data: Prisma.PublicationAttemptUpdateInput, itemStatus: "PUBLISHED" | "APPROVED" | "SCHEDULED" | "AWAITING_APPROVAL") =>
    prisma.$transaction([
      prisma.publicationAttempt.update({ where: { id: a.id }, data: { status, ...data } }),
      prisma.contentItem.update({ where: { id: a.contentItemId }, data: { status: itemStatus } }),
      prisma.auditEvent.create({
        data: { workspaceId: a.workspaceId, brandId: a.brandId, actorUserId: a.createdByUserId, action: `content.publish.${status.toLowerCase()}`, entityType: "PublicationAttempt", entityId: a.id, metadata: { provider: a.provider } },
      }),
    ]);

  // Re-check the seal at the moment of posting: an edit after scheduling voids the approval.
  const { item, latest } = await loadItem(a, a.contentItemId);
  const approval = await currentApproval(item.id, latest, item.channel);
  if (!latest || latest.id !== a.contentVersionId || approval?.packageHash !== a.packageHash) {
    await finish("FAILED", { error: "The draft changed after approval. Approve the new version, then publish again." }, "AWAITING_APPROVAL");
    return;
  }
  const conn = await prisma.integrationConnection.findFirst({ where: { id: a.connectionId, status: "ACTIVE" } });
  const publisher = PUBLISHERS[a.provider];
  if (!conn?.encryptedCredentials || !publisher) {
    await finish("FAILED", { error: "The account was disconnected. Reconnect it and publish again." }, "APPROVED");
    return;
  }
  const body = latest.body as Body;
  const target = a.target as { boardId: string | null; imageUrl: string | null };
  const profile = await prisma.brandProfile.findFirst({ where: { brandId: a.brandId }, select: { websiteUrl: true } });
  try {
    const { accessToken } = decryptCredentials<{ accessToken: string }>(conn.encryptedCredentials);
    const res = await publisher(
      { text: postText(body), title: body.pinTitle || body.hook || item.title, altText: body.altText ?? "", link: safeHttpUrl(profile?.websiteUrl)?.href ?? null, imageUrl: target.imageUrl, boardId: target.boardId },
      { id: conn.externalAccountId, token: accessToken },
    );
    await finish("PUBLISHED", { externalId: res.externalId, externalUrl: safeHttpUrl(res.externalUrl)?.href ?? null, publishedAt: new Date(), error: null }, "PUBLISHED");
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 300) : "Unknown error";
    if (e instanceof PublishRefused) await finish("FAILED", { error: msg }, "APPROVED");
    else await finish("PENDING_VERIFY", { error: `We couldn't confirm whether it posted (${msg}). Check the account before trying again.` }, "SCHEDULED");
  }
}

/** Cancel a scheduled post, or settle a PENDING_VERIFY one after someone looked at the account. */
export async function settlePublication(input: {
  workspaceId: string;
  brandId: string;
  userId: string;
  attemptId: string;
  action: "cancel" | "posted" | "not-posted";
  url?: string;
}) {
  const from = input.action === "cancel" ? "SCHEDULED" : "PENDING_VERIFY";
  const to = input.action === "posted" ? "PUBLISHED" : input.action === "cancel" ? "CANCELLED" : "FAILED";
  const a = await prisma.publicationAttempt.findFirst({ where: { id: input.attemptId, workspaceId: input.workspaceId, brandId: input.brandId } });
  if (!a) throw new PublishingError("Not found", 404);
  const externalUrl = input.url ? safeHttpUrl(input.url)?.href ?? null : null;
  const { count } = await prisma.publicationAttempt.updateMany({
    where: { id: a.id, status: from },
    data: { status: to, ...(to === "PUBLISHED" ? { publishedAt: new Date(), externalUrl, error: null } : {}), ...(to === "FAILED" ? { error: "Checked: it didn't post. You can publish again." } : {}) },
  });
  if (count !== 1) throw new PublishingError(input.action === "cancel" ? "It's no longer scheduled" : "This was already settled");
  await prisma.contentItem.update({ where: { id: a.contentItemId }, data: { status: to === "PUBLISHED" ? "PUBLISHED" : "APPROVED" } });
  await prisma.auditEvent.create({
    data: { workspaceId: a.workspaceId, brandId: a.brandId, actorUserId: input.userId, action: `content.publish.${input.action}`, entityType: "PublicationAttempt", entityId: a.id, metadata: {} },
  });
}

/** Everything the post view needs: history, whether approval still holds, and where it can go. */
export async function releaseState(scope: { workspaceId: string; brandId: string }, itemId: string) {
  const { item, latest } = await loadItem(scope, itemId);
  const [decisions, attempts, approval] = await Promise.all([
    prisma.approvalDecision.findMany({ where: { contentItemId: item.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.publicationAttempt.findMany({ where: { contentItemId: item.id }, orderBy: { createdAt: "desc" }, take: 20 }),
    currentApproval(item.id, latest, item.channel),
  ]);
  // ponytail: a crashed worker leaves PUBLISHING forever; after 10 min treat it as unknown outcome.
  for (const a of attempts) {
    if (a.status === "PUBLISHING" && Date.now() - a.updatedAt.getTime() > 10 * 60_000) {
      await prisma.publicationAttempt.updateMany({ where: { id: a.id, status: "PUBLISHING" }, data: { status: "PENDING_VERIFY", error: "Publishing stopped midway. Check the account before trying again." } });
      a.status = "PENDING_VERIFY";
    }
  }
  const req = publishRequirements(item.channel);
  const accounts = req.provider
    ? await prisma.integrationConnection.findMany({ where: { brandId: item.brandId, provider: req.provider, status: "ACTIVE" }, select: { id: true, displayName: true } })
    : [];
  const userIds = [...new Set([...decisions.map((d) => d.userId), ...attempts.map((a) => a.createdByUserId)])];
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } });
  const who = (id: string) => { const u = users.find((x) => x.id === id); return u?.name || u?.email || "Someone"; };
  const accountName = new Map(accounts.map((a) => [a.id, a.displayName]));
  return {
    latestVersion: latest?.version ?? null,
    approvedVersionId: approval?.contentVersionId ?? null,
    approvalValid: Boolean(approval),
    requirements: req,
    accounts,
    decisions: decisions.map((d) => ({ id: d.id, verdict: d.verdict, note: d.note, by: who(d.userId), at: d.createdAt, current: d.id === approval?.id, version: d.contentVersionId === latest?.id ? latest.version : null })),
    attempts: attempts.map((a) => ({ id: a.id, status: a.status, provider: a.provider, account: accountName.get(a.connectionId) ?? "Disconnected account", runAt: a.runAt, publishedAt: a.publishedAt, externalUrl: a.externalUrl, error: a.error, by: who(a.createdByUserId) })),
  };
}
