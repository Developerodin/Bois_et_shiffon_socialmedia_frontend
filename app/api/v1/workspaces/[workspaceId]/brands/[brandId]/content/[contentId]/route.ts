import { z } from "zod";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { decryptCredentials } from "@/server/crypto/credentials";
import { prisma } from "@/server/db/prisma";
import { pinterestBoards } from "@/server/integrations/publishers";
import { kickRunner } from "@/server/jobs/runner";
import { decide, PublishingError, releaseState, schedulePublication, settlePublication } from "@/server/services/publishing";

type Params = { params: Promise<BrandRouteParams & { contentId: string }> };

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("decide"), version: z.number().int(), verdict: z.enum(["APPROVED", "CHANGES_REQUESTED", "REJECTED"]), note: z.string().max(2000).optional() }),
  z.object({
    action: z.literal("publish"),
    version: z.number().int(),
    connectionId: z.string().min(1),
    boardId: z.string().max(100).optional(),
    imageUrl: z.string().max(2000).optional(),
    runAt: z.string().datetime({ offset: true }).optional(),
  }),
  z.object({ action: z.enum(["cancel", "posted", "not-posted"]), attemptId: z.string().min(1), url: z.string().max(2000).optional() }),
]);

const PERMISSION = { decide: "content.approve", publish: "publish.execute", cancel: "publish.execute", posted: "publish.execute", "not-posted": "publish.execute" } as const;

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
        const c = await prisma.integrationConnection.findUnique({ where: { id: a.id }, select: { encryptedCredentials: true } });
        boards[a.id] = c?.encryptedCredentials
          ? await pinterestBoards(decryptCredentials<{ accessToken: string }>(c.encryptedCredentials).accessToken).catch(() => null)
          : null;
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
    if (!parsed.success) return problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400 });
    const body = parsed.data;
    const scope = await authorizeBrandRoute(request, context.params, PERMISSION[body.action]);
    if (scope instanceof Response) return scope;
    const { contentId: itemId } = await context.params;
    if (body.action === "decide") {
      await decide({ ...scope, itemId, version: body.version, verdict: body.verdict, note: body.note });
    } else if (body.action === "publish") {
      const a = await schedulePublication({ ...scope, itemId, version: body.version, connectionId: body.connectionId, boardId: body.boardId, imageUrl: body.imageUrl, runAt: body.runAt ? new Date(body.runAt) : undefined });
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
