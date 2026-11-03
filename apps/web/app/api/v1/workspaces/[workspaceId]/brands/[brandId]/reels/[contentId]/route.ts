import { z } from "zod";
import { problemResponse } from "@/server/api/http-error";
import { authorizeBrandRoute, type BrandRouteParams } from "@/server/api/brand-route";
import { kickIfDue, kickRunner } from "@/server/jobs/runner";
import { ReelPlan } from "@/server/reels/plan";
import { enqueueTick, startRender } from "@/server/reels/render";
import { editPlan, recheckQuality, reelDetail, registerPostLink, sendReel, toReelProblem as toProblem } from "@/server/reels/service";
import { InsufficientCreditsError } from "@/server/services/credits";
import { prisma } from "@/server/db/prisma";
import { PlanRequiredError } from "@/server/services/subscriptions";

// Directing an edited plan is an AI call; render steps run after the response.
export const maxDuration = 300;

type Params = { params: Promise<BrandRouteParams & { contentId: string }> };

/** R03/R05/R07 polling: plan, render progress, checks, chat. Also nudges a stalled render along. */
export async function GET(request: Request, context: Params) {
  try {
    const scope = await authorizeBrandRoute(request, context.params, "brand.read");
    if (scope instanceof Response) return scope;
    const { contentId } = await context.params;
    const detail = await reelDetail(scope, contentId);
    const running = await prisma.reelRender.findFirst({ where: { contentItemId: contentId, step: { in: ["VOICE", "CLIPS", "JOIN"] } } });
    if (running && Date.now() - running.updatedAt.getTime() > 60_000) await enqueueTick(running);
    await kickIfDue();
    return Response.json(detail);
  } catch (error) {
    return toProblem(error);
  }
}

/** R10–R13 / R03: save an edited plan. */
export async function PATCH(request: Request, context: Params) {
  try {
    const parsed = z.object({ version: z.number().int().min(0), plan: ReelPlan }).safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);
    const scope = await authorizeBrandRoute(request, context.params, "content.create");
    if (scope instanceof Response) return scope;
    const { contentId } = await context.params;
    return Response.json(await editPlan(scope, contentId, parsed.data));
  } catch (error) {
    return toProblem(error);
  }
}

const Action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("render"), version: z.number().int().min(1) }),
  z.object({ action: z.literal("send"), version: z.number().int().min(1), how: z.literal("download") }),
  z.object({ action: z.literal("recheck") }),
  z.object({ action: z.literal("register-link"), url: z.string().min(1).max(500) }),
]);
const PERMISSION = { render: "content.create", send: "content.approve", recheck: "content.create", "register-link": "publish.execute" } as const;

/** Make video / Try again (render), Download (send: the approval act), Posted it? Add link (register-link). */
export async function POST(request: Request, context: Params) {
  try {
    const parsed = Action.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return invalid(parsed.error);
    const body = parsed.data;
    const scope = await authorizeBrandRoute(request, context.params, PERMISSION[body.action]);
    if (scope instanceof Response) return scope;
    const { contentId: itemId } = await context.params;
    if (body.action === "render") {
      try {
        const r = await startRender({ ...scope, itemId, version: body.version });
        kickRunner();
        return Response.json({ render: { id: r.id, step: r.step, attempt: r.attempt } }, { status: 202 });
      } catch (e) {
        if (e instanceof InsufficientCreditsError) return Response.json({ insufficientCredits: true, balance: e.balance, needed: e.needed }, { status: 402 });
        // No plan: 402 with planRequired, so the app opens the plan gate (L02) rather than "not enough credits".
        if (e instanceof PlanRequiredError) return Response.json({ planRequired: true, title: e.message }, { status: 402 });
        throw e;
      }
    }
    if (body.action === "recheck") return Response.json({ status: await recheckQuality(scope, itemId) }, { status: 202 });
    if (body.action === "send") return Response.json(await sendReel(scope, itemId, body.version));
    await registerPostLink(scope, itemId, body.url);
    return Response.json({ ok: true });
  } catch (error) {
    return toProblem(error);
  }
}

const invalid = (error: z.ZodError) =>
  problemResponse({ type: "https://api.brandpilot/errors/validation", title: "Invalid request", status: 400, detail: error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") });
