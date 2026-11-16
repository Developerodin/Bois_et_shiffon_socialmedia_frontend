import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { startAgentRun } from "@/server/agents/engine";
import { prisma } from "@/server/db/prisma";
import { kickRunner } from "@/server/jobs/runner";
import { createPost, ownMediaKey, postAiAllowed, PublishingError } from "@/server/services/publishing";
import { signedMediaUrl } from "@/server/storage/media";
import { isStoryBody } from "@/server/stories/body";
import { coverUrl, createStory, failStoryStart, STORY_RENDER_JOB, STORY_START_NOTE, storyForRequest, storyTab } from "@/server/stories/service";

/** Calendar items with their latest draft and its latest quality check. */
export async function GET(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const rows = await prisma.contentItem.findMany({
      where: { workspaceId: scope.workspaceId, brandId: scope.brandId, status: { not: "CANCELLED" } },
      // Unscheduled first (a post just made in the app has no date yet), then by date.
      // ponytail: 200 items; filter by month when a brand's calendar outgrows that.
      orderBy: [{ scheduledFor: { sort: "asc", nulls: "first" } }, { createdAt: "asc" }],
      take: 200,
      include: {
        opportunity: { select: { title: true } },
        versions: { orderBy: { version: "desc" }, take: 1, include: { checks: { orderBy: { createdAt: "desc" }, take: 1 } } },
        decisions: { orderBy: { createdAt: "desc" }, take: 1, select: { verdict: true, note: true, contentVersionId: true } },
        publications: { orderBy: { createdAt: "desc" }, take: 1, select: { status: true, error: true } },
      },
    });
    // The draft's pictures (photoKeys, the first is the cover), signed for an hour: Today, Calendar and the post show them.
    // A studio reel has no photoKeys: its first scene's photo stands in as the cover.
    const photoKeys = (r: (typeof rows)[number]) => {
      const body = r.versions[0]?.body as { photoKeys?: string[]; scenes?: { photoKey?: string }[] } | undefined;
      return body?.photoKeys ?? (body?.scenes?.[0]?.photoKey ? [body.scenes[0].photoKey] : []);
    };
    // Writers already check keys (ownMediaKey); checked again here so a bad stored key is never signed.
    const photoUrls = await Promise.all(rows.map((r) => Promise.all(photoKeys(r).filter((k) => ownMediaKey(scope, k)).map((k) => signedMediaUrl(k)))));
    // Stories: their P07 tab (any partly posted or unverified attempt, not only the latest, moves one to Posted) and
    // the first rendered frame as the card.
    const storyIds = rows.filter((r) => r.channel === "INSTAGRAM_STORY").map((r) => r.id);
    const openAttempts = storyIds.length
      ? await prisma.publicationAttempt.findMany({ where: { contentItemId: { in: storyIds }, status: { in: ["PARTIAL", "PENDING_VERIFY"] } }, select: { contentItemId: true, status: true } })
      : [];
    // Stories whose frames are being prepared (a first save has no version until its render ends). One read of the
    // brand's in-flight renders, matched here. ponytail: fine while renders in flight are few; filter by item in SQL if not.
    const renders = storyIds.length
      ? await prisma.job.findMany({ where: { type: STORY_RENDER_JOB, workspaceId: scope.workspaceId, brandId: scope.brandId, status: { in: ["PENDING", "RUNNING"] } }, select: { payload: true } })
      : [];
    const rendering = new Set(renders.map((j) => (j.payload as { itemId?: unknown } | null)?.itemId));
    const story = async (r: (typeof rows)[number]) => {
      if (r.channel !== "INSTAGRAM_STORY") return {};
      const body = r.versions[0]?.body;
      return {
        tab: storyTab(r, openAttempts.filter((a) => a.contentItemId === r.id)),
        rendering: rendering.has(r.id),
        firstFrameUrl: isStoryBody(body) ? await coverUrl(scope, body.frames[0]?.renderedKey) : null,
      };
    };
    const stories = await Promise.all(rows.map(story));
    return Response.json({
      items: rows.map(({ versions, decisions, publications, ...i }, n) => ({
        ...i,
        ...stories[n],
        // The last publish went wrong: "FAILED" (back to Approved, reason in publishError) or "CHECK" (may have posted).
        publishIssue: publications[0]?.status === "PENDING_VERIFY" ? "CHECK" : publications[0]?.status === "FAILED" && i.status === "APPROVED" ? "FAILED" : null,
        publishError: publications[0]?.status === "FAILED" || publications[0]?.status === "PENDING_VERIFY" ? publications[0].error : null,
        latest: versions[0]
          ? {
              version: versions[0].version,
              body: versions[0].body,
              createdAt: versions[0].createdAt,
              byPerson: versions[0].createdBy !== "agent",
              photoUrls: photoUrls[n],
              check: versions[0].checks[0] ?? null,
              // The approver's last word on this exact draft (e.g. the changes they asked for).
              review: decisions[0]?.contentVersionId === versions[0].id ? { verdict: decisions[0].verdict, note: decisions[0].note } : null,
            }
          : null,
      })),
    });
  } catch (error) {
    return fromAccessError(error);
  }
}

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

const NewPostInput = z.object({
  channel: z.enum(["INSTAGRAM_POST", "INSTAGRAM_CAROUSEL"]),
  goal: z.enum(["newArrival", "productFeature", "specialOffer"]),
  product: z.object({ title: z.string().trim().min(1).max(200), photoKey: z.string().min(1).max(300) }),
  direction: z.string().max(500).optional(),
});

// A new story (P07): paid, once per requestId (a uuid the app makes when the person taps).
const NewStoryInput = z.object({
  channel: z.literal("INSTAGRAM_STORY"),
  goal: z.enum(["newArrival", "productFeature", "specialOffer"]),
  productId: z.string().min(1).max(100),
  direction: z.string().max(500).optional(),
  requestId: z.string().uuid(),
});

/** A new post or story from the app (P06/P07): the Creator writes it now, then Quality checks it. */
export async function POST(request: Request, context: { params: Promise<BrandRouteParams> }) {
  try {
    const json = await request.json().catch(() => null);
    const isStory = (json as { channel?: unknown } | null)?.channel === "INSTAGRAM_STORY";
    const parsed = isStory ? NewStoryInput.safeParse(json) : NewPostInput.safeParse(json);
    if (!parsed.success) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400, detail: parsed.error.issues[0]?.message });
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    // A retried request gets its story back without touching the rate limit.
    if (parsed.data.channel === "INSTAGRAM_STORY") {
      const again = await storyForRequest(scope, parsed.data.requestId);
      if (again) return Response.json({ id: again.id });
    }
    if (!(await postAiAllowed(scope.workspaceId))) return problemResponse({ type: "https://api.brandpilot/errors/limit", title: "Too many posts written today. Try again tomorrow.", status: 429 });
    if (parsed.data.channel === "INSTAGRAM_STORY") {
      const story = await createStory(scope, parsed.data);
      // A repeat of a request already taken: the same story, no second run.
      if (story.repeated) return Response.json({ id: story.id });
      try {
        await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "creator", trigger: "event", input: { itemId: story.id }, prepaidChargeId: story.chargeId });
      } catch (e) {
        await failStoryStart(scope, story.id, story.chargeId);
        throw new PublishingError(STORY_START_NOTE, 502, "story.writeStart");
      }
      kickRunner();
      return Response.json({ id: story.id }, { status: 201 });
    }
    const item = await createPost({ ...scope, ...parsed.data });
    await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "creator", trigger: "event", input: { itemId: item.id } }).catch(() => null);
    kickRunner();
    return Response.json({ id: item.id }, { status: 201 });
  } catch (error) {
    if (error instanceof PublishingError) return problemResponse({ type: "https://api.brandpilot/errors/publishing", title: error.message, status: error.status, detail: error.message, code: error.code });
    return fromAccessError(error);
  }
}
