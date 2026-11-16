import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { startAgentRun } from "@/server/agents/engine";
import { prisma } from "@/server/db/prisma";
import { pinterestBoards } from "@/server/integrations/publishers";
import { kickRunner } from "@/server/jobs/runner";
import { accessToken } from "@/server/services/connections";
import { autoPublish } from "@/server/services/automations";
import { decide, markDone, postAiAllowed, postRest, PublishingError, releaseState, saveDraft, schedulePublication, settleFrame, settlePublication } from "@/server/services/publishing";
import { registerManualPost } from "@/server/services/manual-post";
import { setByHand } from "@/server/stories/by-hand";
import { parseStoryInput } from "@/server/stories/body";
import { deleteStory, duplicateStory, failStoryStart, reopenStoryWrite, saveStoryVersion, STORY_START_NOTE, storyView } from "@/server/stories/service";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

type Params = { params: Promise<BrandRouteParams & { contentId: string }> };

const text = (max: number) => z.string().max(max).default("");
const list = (items: number, max: number) => z.array(z.string().max(max, `${max} characters at most`)).max(items, `${items} at most`).default([]);

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    version: z.number().int().min(0),
    body: z.object({ hook: text(500), caption: z.string().min(1).max(5000), hashtags: list(30, 100), slides: list(20, 1000), script: list(30, 1000), pinTitle: text(200), altText: text(1000), photoKeys: z.array(z.string().max(300)).max(10).optional() }),
  }),
  // noAutoPublish: the app's Schedule approves and then schedules itself, so auto-publish stays out of its way.
  // override: "Approve anyway" past product availability issues; switchProducts: a send-back asking for another product.
  z.object({ action: z.literal("decide"), version: z.number().int(), verdict: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]), note: z.string().max(2000).optional(), noAutoPublish: z.boolean().optional(), override: z.boolean().optional(), switchProducts: z.boolean().optional() }),
  z.object({
    action: z.literal("publish"),
    version: z.number().int(),
    connectionId: z.string().min(1),
    boardId: z.string().max(100).optional(),
    imageUrl: z.string().max(2000).optional(),
    imageLinks: z.array(z.string().max(2000)).max(10).optional(),
    mediaKeys: z.array(z.string().max(300)).max(10).optional(),
    videoUrl: z.string().max(2000).optional(),
    runAt: z.string().datetime({ offset: true }).optional(),
  }),
  z.object({ action: z.enum(["cancel", "posted", "not-posted"]), attemptId: z.string().min(1), url: z.string().max(2000).optional() }),
  // The app's "Fix it" / "Try again": the writer (re)writes a post that's waiting for a draft, blocked or sent back,
  // or the check runs again on a draft that never got one.
  z.object({ action: z.literal("rewrite"), version: z.number().int().min(0) }),
  // A story's save: `story` is checked by parseStoryInput (which also strips server fields).
  z.object({ action: z.literal("editStory"), version: z.number().int().min(0), story: z.unknown() }),
  // A partly posted story: post the frames still missing (confirm: go ahead although posted frames expired), leave it
  // as it is, or say whether the unconfirmed frame (0-based) appeared.
  z.object({ action: z.literal("postRest"), attemptId: z.string().min(1), confirm: z.boolean().optional() }),
  z.object({ action: z.literal("markDone"), attemptId: z.string().min(1) }),
  z.object({ action: z.literal("settleFrame"), attemptId: z.string().min(1), frame: z.number().int().min(0).max(4), appeared: z.boolean() }),
  // Post a story by hand: `at` is when it is due (null turns it off); postedByHand says it was posted (url: the story's link, checked and kept).
  z.object({ action: z.literal("byHand"), at: z.string().datetime({ offset: true }).nullable() }),
  z.object({ action: z.literal("postedByHand"), url: z.string().max(2000).optional() }),
  z.object({ action: z.literal("duplicate") }),
  z.object({ action: z.literal("delete") }),
]);

const PERMISSION = { rewrite: "content.create", edit: "content.create", editStory: "content.create", duplicate: "content.create", delete: "content.create", decide: "content.approve", publish: "publish.execute", postRest: "publish.execute", markDone: "publish.execute", byHand: "publish.execute", postedByHand: "publish.execute", settleFrame: "publish.execute", cancel: "publish.execute", posted: "publish.execute", "not-posted": "publish.execute" } as const;

/** Approval history, publishing history, and where this post can go (with Pinterest boards). */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const { contentId } = await context.params;
    const state = await releaseState(scope, contentId);
    const boards: Record<string, { id: string; name: string }[] | null> = {};
    if (state.requirements.needsBoard) {
      for (const a of state.accounts) {
        // Any failure (expired access, bad key, Pinterest down) shows as "couldn't load boards", not a broken page.
        const c = await prisma.integrationConnection.findUnique({ where: { id: a.id } });
        boards[a.id] = c ? await accessToken(c).then(pinterestBoards).catch(() => null) : null;
      }
    }
    return Response.json({ ...state, boards, ...(await storyExtras(scope, contentId, state.requirements)) });
  } catch (error) {
    return toProblem(error);
  }
}

export async function POST(request: Request, context: Params) {
  try {
    const parsed = Action.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      // e.g. "body.slides: 20 at most", so people know which limit they hit.
      const detail = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
      return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400, detail });
    }
    const body = parsed.data;
    const scope = await authorizeBrandRoute(request, context.params, PERMISSION[body.action]);
    if (scope instanceof Response) return scope;
    const { contentId: itemId } = await context.params;
    // An edit or a send-back starts free AI runs (Quality, Creator): capped per workspace per day.
    const startsAi =
      body.action === "edit" ||
      body.action === "editStory" ||
      body.action === "rewrite" ||
      (body.action === "decide" && body.verdict === "CHANGES_REQUESTED" && !(await prisma.contentItem.findFirst({ where: { id: itemId, brandId: scope.brandId }, select: { studio: true } }))?.studio);
    if (startsAi && !(await postAiAllowed(scope.workspaceId))) throw new PublishingError("Too many posts written today. Try again tomorrow.", 429);
    if (body.action === "duplicate") {
      const copy = await duplicateStory(scope, itemId);
      return Response.json({ id: copy.id }, { status: 201 });
    }
    if (body.action === "delete") {
      await deleteStory(scope, itemId);
      return new Response(null, { status: 204 });
    }
    if (body.action === "editStory") {
      const saved = await saveStoryVersion(scope, itemId, body.version, parseStoryInput(body.story), { kind: "person", userId: scope.userId });
      // Saved now: check it now, as for posts. Rendering: the render job starts Quality itself once the version exists.
      if (saved.status === "saved") {
        await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "quality", trigger: "event", input: { itemId, version: saved.version } }).catch(() => null);
      }
      kickRunner();
      const state = await releaseState(scope, itemId);
      return Response.json({ ...state, saved: saved.status, ...(await storyExtras(scope, itemId, state.requirements)) });
    } else if (body.action === "edit") {
      const saved = await saveDraft({ ...scope, itemId, version: body.version, body: body.body });
      // Check this edit now rather than at the next daily run, so the person can schedule it today.
      await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "quality", trigger: "event", input: { itemId, version: saved.version } }).catch(() => null);
      kickRunner();
    } else if (body.action === "rewrite") {
      const item = await prisma.contentItem.findFirst({
        where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId, studio: false },
        select: { status: true, channel: true, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, checks: { orderBy: { createdAt: "desc" }, take: 1, select: { overall: true } } } } },
      });
      const latest = item?.versions[0];
      const story = item?.channel === "INSTAGRAM_STORY";
      // A story whose writer failed (or never started) is BLOCKED; "Fix it" reopens it.
      if (!item || !["BRIEF_READY", "DRAFT_REVIEW", ...(story ? ["BLOCKED"] : [])].includes(item.status) || (latest?.version ?? 0) !== body.version) {
        throw new PublishingError("This post isn't waiting for the writer any more. Reload it.", 409);
      }
      // A draft with no check yet needs the check, not a new draft (the writer leaves people's edits alone).
      const unchecked = item.status === "DRAFT_REVIEW" && latest && !latest.checks[0];
      // A story with no version whose charge was refunded pays again (5 credits, once per retry); anything else is free.
      const chargeId = story && !unchecked ? await reopenStoryWrite(scope, itemId) : null;
      try {
        await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: unchecked ? "quality" : "creator", trigger: "event", input: unchecked ? { itemId, version: latest.version } : { itemId }, ...(chargeId ? { prepaidChargeId: chargeId } : {}) });
      } catch (e) {
        if (!chargeId) throw e;
        await failStoryStart(scope, itemId, chargeId);
        throw new PublishingError(STORY_START_NOTE, 502, "story.writeStart");
      }
      kickRunner();
    } else if (body.action === "decide") {
      await decide({ ...scope, itemId, version: body.version, verdict: body.verdict, note: body.note, override: body.override, switchProducts: body.switchProducts });
      // After an override the person schedules: auto-publish would re-book the first account after a cancelled schedule.
      if (body.verdict === "APPROVED" && !body.noAutoPublish && !body.override) {
        await autoPublish(scope, itemId);
        kickRunner();
      }
      // Sent back: the Creator rewrites this post now (studio reels are rewritten in the app's chat instead).
      if (startsAi) {
        await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "creator", trigger: "event", input: { itemId } }).catch(() => null);
        kickRunner();
      }
    } else if (body.action === "publish") {
      const a = await schedulePublication({ ...scope, itemId, version: body.version, connectionId: body.connectionId, boardId: body.boardId, imageUrl: body.imageUrl, imageLinks: body.imageLinks, mediaKeys: body.mediaKeys, videoUrl: body.videoUrl, runAt: body.runAt ? new Date(body.runAt) : undefined });
      if (a.runAt.getTime() <= Date.now() + 5_000) kickRunner();
    } else if (body.action === "postRest") {
      await postRest({ ...scope, itemId, attemptId: body.attemptId, confirm: body.confirm });
      kickRunner();
    } else if (body.action === "byHand") {
      await setByHand(scope, itemId, body.at ? new Date(body.at) : null);
    } else if (body.action === "postedByHand") {
      await registerManualPost(scope, itemId, body.url, "story");
    } else if (body.action === "markDone") {
      await markDone({ ...scope, itemId, attemptId: body.attemptId });
    } else if (body.action === "settleFrame") {
      await settleFrame({ ...scope, itemId, attemptId: body.attemptId, frame: body.frame, appeared: body.appeared });
    } else {
      await settlePublication({ ...scope, itemId, attemptId: body.attemptId, action: body.action, url: body.url });
    }
    return Response.json(await releaseState(scope, itemId));
  } catch (error) {
    return toProblem(error);
  }
}

/** A story's render progress and rendered frames (signed for an hour); nothing for other posts. */
async function storyExtras(scope: { workspaceId: string; brandId: string }, itemId: string, requirements: object) {
  return "frames" in requirements ? storyView(scope, itemId) : {};
}

function toProblem(error: unknown) {
  if (error instanceof PublishingError) {
    return problemResponse({ type: "https://api.brandpilot/errors/publishing", title: error.message, status: error.status, detail: error.message, code: error.code, ...error.data });
  }
  return fromAccessError(error);
}
