import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { startAgentRun } from "@/server/agents/engine";
import { prisma } from "@/server/db/prisma";
import { pinterestBoards } from "@/server/integrations/publishers";
import { kickRunner } from "@/server/jobs/runner";
import { accessToken } from "@/server/services/connections";
import { decide, PublishingError, releaseState, saveDraft, schedulePublication, settlePublication } from "@/server/services/publishing";

// Queued work runs after the response (kickRunner); give it room to finish.
export const maxDuration = 300;

type Params = { params: Promise<BrandRouteParams & { contentId: string }> };

const text = (max: number) => z.string().max(max).default("");
const list = (items: number, max: number) => z.array(z.string().max(max, `${max} characters at most`)).max(items, `${items} at most`).default([]);

const Action = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    version: z.number().int().min(0),
    body: z.object({ hook: text(500), caption: z.string().min(1).max(5000), hashtags: list(30, 100), slides: list(20, 1000), script: list(30, 1000), pinTitle: text(200), altText: text(1000) }),
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
]);

const PERMISSION = { edit: "content.create", decide: "content.approve", publish: "publish.execute", cancel: "publish.execute", posted: "publish.execute", "not-posted": "publish.execute" } as const;

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
    if (body.action === "edit") {
      await saveDraft({ ...scope, itemId, version: body.version, body: body.body });
      // Studio reels have no Creator/Quality schedule behind them: check this edit now.
      if ((await prisma.contentItem.findUnique({ where: { id: itemId }, select: { studio: true } }))?.studio) {
        await startAgentRun({ workspaceId: scope.workspaceId, brandId: scope.brandId, agentKey: "quality", trigger: "event", input: { itemId } }).catch(() => null);
        kickRunner();
      }
    } else if (body.action === "decide") {
      await decide({ ...scope, itemId, version: body.version, verdict: body.verdict, note: body.note });
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
