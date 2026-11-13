import { prisma } from "@/server/db/prisma";
import { currentApproval, lock, PublishingError, TX } from "@/server/services/publishing";

const INSTAGRAM_POST = /^https:\/\/(www\.)?instagram\.com\/(reel|reels|p)\/[A-Za-z0-9_-]+\/?(\?.*)?$/;

/**
 * Someone posted an approved reel or story by hand and says so. A reel pastes its post's link back so results can be
 * followed; a story takes no link (it is gone in a day, and its link can't be read back). Stories also end "Post by hand".
 */
export async function registerManualPost(scope: { workspaceId: string; brandId: string; userId: string }, itemId: string, url: string | undefined, kind: "reel" | "story") {
  const link = url?.trim();
  if (kind === "reel" && !(link && INSTAGRAM_POST.test(link))) throw new PublishingError("Paste the link of the Instagram post (instagram.com/reel/…)", 400);
  if (kind === "story" && link) throw new PublishingError("A story doesn't need a link. Just say it was posted.", 400, "story.noUrl");
  const noun = kind === "reel" ? "Reel" : "Story";
  await prisma.$transaction(async (tx) => {
    await lock(tx, itemId);
    const item = await tx.contentItem.findFirst({
      where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId, ...(kind === "reel" ? { studio: true } : { channel: "INSTAGRAM_STORY" }) },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    if (!item) throw new PublishingError(`${noun} not found`, 404);
    if (item.status === "SCHEDULED") {
      throw new PublishingError(`This ${noun.toLowerCase()} is scheduled to post by itself. Cancel that first.`, 409, kind === "story" ? "story.cancelScheduledFirst" : undefined);
    }
    if (item.status !== "APPROVED") throw new PublishingError(kind === "reel" ? "Download the reel first, then add its link." : "Approve the story first.", 409, kind === "story" ? "story.notApproved" : undefined);
    // A story's package is only good while its approval holds; a newer, unapproved version can't be what was posted.
    if (kind === "story" && !(await currentApproval(item.id, item.versions[0] ?? null, item.channel, tx))) {
      throw new PublishingError("The approval no longer holds. Review the latest version.", 409, "story.notApproved");
    }
    await tx.contentItem.update({ where: { id: itemId }, data: { status: "PUBLISHED", ...(kind === "reel" ? { postUrl: link } : { byHand: false }) } });
    await tx.auditEvent.create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "content.publish.manual", entityType: "ContentItem", entityId: itemId, metadata: kind === "reel" ? { url: link } : { kind: "story" } },
    });
  }, TX);
}
