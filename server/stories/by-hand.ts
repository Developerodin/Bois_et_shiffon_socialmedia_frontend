import { prisma } from "@/server/db/prisma";
import { currentApproval, loadItem, lock, productGate, PublishingError, TX } from "@/server/services/publishing";
import { isStoryBody } from "@/server/stories/body";
import { coverUrl, renderedUrl } from "@/server/stories/service";

type BrandScope = { workspaceId: string; brandId: string };
type Scope = BrandScope & { userId: string };

export const STORY_LINK = /^https:\/\/(www\.)?instagram\.com\/stories\/([A-Za-z0-9._]{1,30})\/(\d{5,25})\/?$/;
const MAX_LINK = 300;

/**
 * Checks a story link a person pasted: Instagram's own story address (query ignored), and, with an Instagram account
 * connected, that account's story. Nothing keeps the link today; this stops a wrong paste early.
 */
export async function checkStoryLink(scope: BrandScope, raw: string): Promise<string> {
  const link = raw.trim();
  if (link.length > MAX_LINK) throw new PublishingError("That link is too long to be a story link.", 400, "story.linkInvalid");
  const bare = link.split(/[?#]/)[0];
  const match = STORY_LINK.exec(bare);
  if (!match) throw new PublishingError("Paste the story's link (instagram.com/stories/…).", 400, "story.linkInvalid");
  const conns = await prisma.integrationConnection.findMany({ where: { brandId: scope.brandId, provider: "INSTAGRAM", status: "ACTIVE" }, select: { displayName: true } });
  const handles = conns.flatMap((c) => (c.displayName ? [c.displayName.replace(/^@/, "").toLowerCase()] : []));
  if (handles.length && !handles.includes(match[2].toLowerCase())) throw new PublishingError("That story is on another account.", 400, "story.linkAccount");
  return bare;
}

/**
 * Turns "Post by hand" on (at: when it is due) or off for an approved story. A booked schedule has to be cancelled first:
 * the same story must never be both scheduled and waiting for a person.
 */
export async function setByHand(scope: Scope, itemId: string, at: Date | null) {
  await prisma.$transaction(async (tx) => {
    await lock(tx, itemId);
    const { item, latest } = await loadItem(scope, itemId, tx);
    if (item.channel !== "INSTAGRAM_STORY") throw new PublishingError("Story not found", 404);
    if (item.status === "SCHEDULED" || (await tx.publicationAttempt.findFirst({ where: { contentItemId: item.id, status: "SCHEDULED" }, select: { id: true } }))) {
      throw new PublishingError("This story is scheduled to post by itself. Cancel that first.", 409, "story.cancelScheduledFirst");
    }
    if (item.status !== "APPROVED" || !(await currentApproval(item.id, latest, item.channel, tx))) throw new PublishingError("Approve the story first.", 409, "story.notApproved");
    await tx.contentItem.update({ where: { id: item.id }, data: at ? { byHand: true, scheduledFor: at } : { byHand: false } });
  }, TX);
}

/** Stories waiting for a person to post them: due now, approved, and the approval still holds. */
export async function dueByHand(scope: BrandScope, now = new Date()) {
  const items = await prisma.contentItem.findMany({
    where: { workspaceId: scope.workspaceId, brandId: scope.brandId, channel: "INSTAGRAM_STORY", byHand: true, status: "APPROVED", scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: 50,
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  const due = [];
  for (const i of items) {
    const latest = i.versions[0] ?? null;
    if (!(await currentApproval(i.id, latest, i.channel))) continue;
    const frames = isStoryBody(latest?.body) ? latest.body.frames : [];
    due.push({ id: i.id, title: i.title, scheduledFor: i.scheduledFor!, firstFrameUrl: await coverUrl(scope, frames[0]?.renderedKey) });
  }
  return due;
}

/**
 * What a person needs to post an approved story themselves: the frames (links good for an hour, as renderedUrl signs them) and its link.
 * Refused unless the approval holds and no product or offer issue stops it (same gate as publishing).
 */
export async function storyPackage(scope: BrandScope, itemId: string) {
  const latest = await prisma.$transaction(async (tx) => {
    const { item, latest } = await loadItem(scope, itemId, tx);
    if (item.channel !== "INSTAGRAM_STORY") throw new PublishingError("Story not found", 404);
    const approval = await currentApproval(item.id, latest, item.channel, tx);
    if (item.status !== "APPROVED" || !approval) throw new PublishingError("Approve the story first.", 409, "story.notApproved");
    const refused = (await productGate(tx, scope, { latest, approval, at: new Date() })).find((i) => i.refuses);
    if (refused) throw new PublishingError(refused.message, 409, "story.gate");
    return latest;
  }, TX);
  const body = isStoryBody(latest?.body) ? latest.body : null;
  // Approval normally guarantees every frame is rendered; if not, nothing half-finished goes out.
  const urls = body ? await Promise.all(body.frames.map((f) => renderedUrl(scope, f.renderedKey))) : [];
  if (!body || !body.frames.length || urls.some((u) => !u)) {
    throw new PublishingError("Every frame needs its finished picture or clip first.", 409, "story.framesNotReady");
  }
  return {
    frames: body.frames.map((f, i) => ({ n: i + 1, url: urls[i] as string, kind: f.mediaKind ?? "photo" })),
    link: body.link,
  };
}
