import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { startAgentRun } from "@/server/agents/engine";
import { prisma } from "@/server/db/prisma";
import { pinterestBoards } from "@/server/integrations/publishers";
import { kickRunner } from "@/server/jobs/runner";
import { accessToken } from "@/server/services/connections";
import { decide, postAiAllowed, PublishingError, releaseState, saveDraft, schedulePublication, settlePublication } from "@/server/services/publishing";

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
  z.object({ action: z.literal("decide"), version: z.number().int(), verdict: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]), note: z.string().max(2000).optional() }),
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
]);

const PERMISSION = { rewrite: "content.create", edit: "content.create", decide: "content.approve", publish: "publish.execute", cancel: "publish.execute", posted: "publish.execute", "not-posted": "publish.execute" } as const;

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
    return Response.json({ ...state, boards });
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
      body.action === "rewrite" ||
      (body.action === "decide" && body.verdict === "CHANGES_REQUESTED" && !(await prisma.contentItem.findFirst({ where: { id: itemId, brandId: scope.brandId }, select: { studio: true } }))?.studio);
    if (startsAi && !(await postAiAllowed(scope.workspaceId))) throw new PublishingError("Too many posts written today. Try again tomorrow.", 429);
    if (body.action === "edit") {
      const saved = await saveDraft({ ...scope, itemId, version: body.version, body: body.body });
      // Check this edit now rather than at the next daily run, so the person can schedule it today.
      await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "quality", trigger: "event", input: { itemId, version: saved.version } }).catch(() => null);
      kickRunner();
    } else if (body.action === "rewrite") {
      const item = await prisma.contentItem.findFirst({
        where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId, studio: false },
        select: { status: true, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, checks: { orderBy: { createdAt: "desc" }, take: 1, select: { overall: true } } } } },
      });
      const latest = item?.versions[0];
      if (!item || !["BRIEF_READY", "DRAFT_REVIEW"].includes(item.status) || (latest?.version ?? 0) !== body.version) {
        throw new PublishingError("This post isn't waiting for the writer any more. Reload it.", 409);
      }
      // A draft with no check yet needs the check, not a new draft (the writer leaves people's edits alone).
      const unchecked = item.status === "DRAFT_REVIEW" && latest && !latest.checks[0];
      await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: unchecked ? "quality" : "creator", trigger: "event", input: unchecked ? { itemId, version: latest.version } : { itemId } });
      kickRunner();
    } else if (body.action === "decide") {
      await decide({ ...scope, itemId, version: body.version, verdict: body.verdict, note: body.note });
      // Sent back: the Creator rewrites this post now (studio reels are rewritten in the app's chat instead).
      if (startsAi) {
        await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "creator", trigger: "event", input: { itemId } }).catch(() => null);
        kickRunner();
      }
    } else if (body.action === "publish") {
      const a = await schedulePublication({ ...scope, itemId, version: body.version, connectionId: body.connectionId, boardId: body.boardId, imageUrl: body.imageUrl, imageLinks: body.imageLinks, mediaKeys: body.mediaKeys, videoUrl: body.videoUrl, runAt: body.runAt ? new Date(body.runAt) : undefined });
      if (a.runAt.getTime() <= Date.now() + 5_000) kickRunner();
    } else {
      await settlePublication({ ...scope, attemptId: body.attemptId, action: body.action, url: body.url });
    }
    return Response.json(await releaseState(scope, itemId));
  } catch (error) {
    return toProblem(error);
  }
}

function toProblem(error: unknown) {
  if (error instanceof PublishingError) {
    return problemResponse({ type: "https://api.brandpilot/errors/publishing", title: error.message, status: error.status, detail: error.message });
  }
  return fromAccessError(error);
}
