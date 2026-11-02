import type { Prisma } from "@prisma/client";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { brandKnowledge, productPhotos } from "@/server/content/knowledge";
import { prisma } from "@/server/db/prisma";
import { directScenes, type DraftSoFar, type ReelPhoto, writePlan } from "@/server/reels/agents";
import { carryStandIns, isStudioPlan, planProblems, ReelPlan, reelPrice, reelSeconds, toVersionBody } from "@/server/reels/plan";
import { renderFailure, renderView } from "@/server/reels/render";
import { creditBalance } from "@/server/services/credits";
import { decide, lock, PublishingError, TX } from "@/server/services/publishing";
import { signedMediaUrl } from "@/server/storage/media";

/** Mobile Reels studio (R01–R13): create, chat, edit, send, register a manual post. Rendering is render.ts. */
type Scope = { workspaceId: string; brandId: string; userId: string };
type ChatTurn = { role: "user" | "assistant"; text: string; at: string };
/** Progress while a plan is written (R04 streams it): the reply so far, then the director's step. */
export type PlanEvent = { type: "stage"; stage: "reading" | "writing" | "directing" } | ({ type: "draft" } & DraftSoFar);
type Emit = (event: PlanEvent) => void;

/**
 * A plan call as a stream of JSON lines: progress events, then {type:"done",result} or {type:"error",status,detail}.
 * The HTTP status is already 200 once streaming starts, so failures travel as the last line.
 */
export function streamPlan(run: (emit: Emit) => Promise<unknown>) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      const send = (line: object) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        send({ type: "done", result: await run(send) });
      } catch (error) {
        const problem = (await toReelProblem(error).json().catch(() => ({}))) as { status?: number; detail?: string; title?: string };
        send({ type: "error", status: problem.status ?? 500, detail: problem.detail ?? problem.title ?? "Something went wrong" });
      } finally {
        controller.close();
      }
    },
  }), { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
export const wantsStream = (request: Request) => (request.headers.get("accept") ?? "").includes("application/x-ndjson");
const ACTIVE = ["VOICE", "CLIPS", "JOIN"] as const;

/** Route error → problem response (shared by the reels routes; route files may only export handlers). */
export function toReelProblem(error: unknown) {
  if (error instanceof PublishingError) return problemResponse({ type: "https://api.brandpilot/errors/reels", title: error.message, status: error.status, detail: error.message });
  return fromAccessError(error);
}

/** Photos the scriptwriter may use: the brand's product photos from Research, plus any already in the plan. */
async function brandPhotos(scope: Scope, current?: ReelPlan): Promise<ReelPhoto[]> {
  const products = (await productPhotos(scope.workspaceId, scope.brandId)).map((p) => ({ ...p, product: p.title }));
  const inPlan = (current?.scenes ?? []).filter((s) => !products.some((p) => p.key === s.photoKey)).map((s) => ({ key: s.photoKey, title: s.shot }));
  // ponytail: 12 products + 60 uploads at most (brand-assets MAX_PRODUCTS, media LIBRARY_MAX), plus the plan's own.
  return [...products, ...inPlan].slice(0, 80);
}

async function loadReel(scope: Scope, itemId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const item = await db.contentItem.findFirst({ where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId, studio: true }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (!item) throw new PublishingError("Reel not found", 404);
  return { item, latest: item.versions[0] ?? null };
}

const chatOf = (brief: unknown) => ((brief as { reelChat?: ChatTurn[] } | null)?.reelChat ?? []);

/** Keeps each scene's director output when the scene didn't change; directs again otherwise. */
async function directed(scope: Scope, plan: ReelPlan, previous?: ReelPlan, emit?: Emit): Promise<ReelPlan> {
  const same = (i: number) => {
    const a = plan.scenes[i];
    const b = previous?.scenes[i];
    return b?.prompt && a.photoKey === b.photoKey && a.direction === b.direction && a.shot === b.shot;
  };
  if (plan.scenes.every((_, i) => same(i))) return { ...plan, scenes: plan.scenes.map((s, i) => ({ ...s, kind: previous!.scenes[i].kind, model: previous!.scenes[i].model, prompt: previous!.scenes[i].prompt, transition: previous!.scenes[i].transition })) };
  emit?.({ type: "stage", stage: "directing" });
  return directScenes(scope, plan);
}

/** A new plan version (person's edit, chat revision or new reel). Blocked while a video is being made from it. */
async function savePlan(scope: Scope, itemId: string, version: number, plan: ReelPlan, chat?: ChatTurn[]) {
  return prisma.$transaction(async (tx) => {
    await lock(tx, itemId);
    const { item, latest } = await loadReel(scope, itemId, tx);
    if ((latest?.version ?? 0) !== version) throw new PublishingError("This plan changed in the meantime. Reload and try again.");
    if (await tx.reelRender.findFirst({ where: { contentItemId: itemId, step: { in: [...ACTIVE] } } })) throw new PublishingError("A video is being made from this plan. Wait for it to finish.", 409);
    if (["SCHEDULED", "PUBLISHED"].includes(item.status)) throw new PublishingError("This reel is already scheduled or posted.", 409);
    const v = await tx.contentVersion.create({ data: { contentItemId: itemId, version: version + 1, body: toVersionBody(plan), createdBy: scope.userId } });
    await tx.contentItem.update({
      where: { id: itemId },
      data: { status: "PLANNED", title: plan.title, ...(chat ? { brief: { ...((item.brief as object | null) ?? {}), reelChat: chat.slice(-40) } as Prisma.InputJsonValue } : {}) },
    });
    return v;
  }, TX);
}

export async function createReel(scope: Scope, input: { opportunityId?: string; prompt?: string; language?: string }, emit?: Emit) {
  emit?.({ type: "stage", stage: "reading" });
  const idea = input.opportunityId
    ? await prisma.opportunity.findFirst({ where: { id: input.opportunityId, workspaceId: scope.workspaceId, brandId: scope.brandId } })
    : null;
  if (input.opportunityId && !idea) throw new PublishingError("Idea not found", 404);
  const photos = await brandPhotos(scope);
  if (photos.length === 0) throw new PublishingError("Add product photos first (Select assets), then plan a reel.", 400);
  const { text: knowledge } = await brandKnowledge(scope.workspaceId, scope.brandId, 3000);
  emit?.({ type: "stage", stage: "writing" });
  const { plan, reply } = await writePlan(scope, { knowledge, photos, idea: idea ?? undefined, message: input.prompt, replyLanguage: input.language, onDraft: emit && ((d) => emit({ type: "draft", ...d })) });
  const ready = await directed(scope, plan, undefined, emit);
  const now = new Date().toISOString();
  const chat: ChatTurn[] = [...(input.prompt ? [{ role: "user" as const, text: input.prompt, at: now }] : []), { role: "assistant", text: reply, at: now }];
  const item = await prisma.contentItem.create({
    data: {
      workspaceId: scope.workspaceId, brandId: scope.brandId, opportunityId: idea?.id ?? null, title: ready.title, channel: "INSTAGRAM_REEL", studio: true, status: "PLANNED",
      brief: { reelChat: chat } as Prisma.InputJsonValue,
      versions: { create: { version: 1, body: toVersionBody(ready), createdBy: scope.userId } },
    },
  });
  return { id: item.id, version: 1, plan: ready, price: reelPrice(ready), reply };
}

/** R04: the person says what they want (or what's wrong with the video); the scriptwriter revises the plan. */
export async function chatPlan(scope: Scope, itemId: string, input: { version: number; message: string; language?: string }, emit?: Emit) {
  emit?.({ type: "stage", stage: "reading" });
  const { item, latest } = await loadReel(scope, itemId);
  const current = isStudioPlan(latest?.body) ? ReelPlan.parse(latest!.body) : undefined;
  const [photos, { text: knowledge }] = await Promise.all([brandPhotos(scope, current), brandKnowledge(scope.workspaceId, scope.brandId, 3000)]);
  const chat = chatOf(item.brief);
  emit?.({ type: "stage", stage: "writing" });
  const { plan, reply } = await writePlan(scope, { knowledge, photos, current, chat, message: input.message, replyLanguage: input.language, onDraft: emit && ((d) => emit({ type: "draft", ...d })) });
  const ready = await directed(scope, carryStandIns(plan, current, true), current, emit);
  const now = new Date().toISOString();
  const v = await savePlan(scope, itemId, input.version, ready, [...chat, { role: "user", text: input.message.slice(0, 2000), at: now }, { role: "assistant", text: reply, at: now }]);
  return { version: v.version, plan: ready, price: reelPrice(ready), reply };
}

/** R10–R13 / R03 edits. */
export async function editPlan(scope: Scope, itemId: string, input: { version: number; plan: ReelPlan }) {
  const problems = planProblems(input.plan, scope);
  if (problems.length) throw new PublishingError(problems.join(" "), 400);
  const { latest } = await loadReel(scope, itemId);
  const previous = isStudioPlan(latest?.body) ? ReelPlan.parse(latest!.body) : undefined;
  const ready = await directed(scope, carryStandIns(input.plan, previous, false), previous);
  const v = await savePlan(scope, itemId, input.version, ready);
  return { version: v.version, plan: ready, price: reelPrice(ready) };
}

/** Download = the approval act (studio reels: the maker may approve). Approves once; later sends reuse it. */
export async function sendReel(scope: Scope, itemId: string, version: number) {
  const { item, latest } = await loadReel(scope, itemId);
  const body = latest?.body as { videoKey?: string } | undefined;
  if (!latest || latest.version !== version) throw new PublishingError("A newer version exists. Review it first.");
  if (!body?.videoKey) throw new PublishingError("This reel has no video yet", 400);
  if (item.status === "AWAITING_APPROVAL") await decide({ ...scope, itemId, version, verdict: "APPROVED" });
  else if (!["APPROVED", "SCHEDULED", "PUBLISHED"].includes(item.status)) throw new PublishingError("The checks are still running. Try again in a moment.", 409);
  return { videoUrl: await signedMediaUrl(body.videoKey, 3600) };
}

const INSTAGRAM_POST = /^https:\/\/(www\.)?instagram\.com\/(reel|reels|p)\/[A-Za-z0-9_-]+\/?(\?.*)?$/;

/** After a manual post: the link the person pasted back, so the reel's results can be followed. */
export async function registerPostLink(scope: Scope, itemId: string, url: string) {
  const link = url.trim();
  if (!INSTAGRAM_POST.test(link)) throw new PublishingError("Paste the link of the Instagram post (instagram.com/reel/…)", 400);
  await prisma.$transaction(async (tx) => {
    await lock(tx, itemId);
    const { item } = await loadReel(scope, itemId, tx);
    if (item.status === "SCHEDULED") throw new PublishingError("This reel is scheduled to post by itself. Cancel that first.", 409);
    if (item.status !== "APPROVED") throw new PublishingError("Download the reel first, then add its link.", 409);
    await tx.contentItem.update({ where: { id: itemId }, data: { status: "PUBLISHED", postUrl: link } });
    await tx.auditEvent.create({ data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "content.publish.manual", entityType: "ContentItem", entityId: itemId, metadata: { url: link } } });
  }, TX);
}

export async function listReels(scope: Omit<Scope, "userId">) {
  const items = await prisma.contentItem.findMany({
    where: { workspaceId: scope.workspaceId, brandId: scope.brandId, studio: true },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { versions: { orderBy: { version: "desc" }, take: 1 }, renders: { orderBy: { createdAt: "desc" }, take: 1 } },
  });
  return Promise.all(items.map(async (i) => {
    const body = i.versions[0]?.body as ({ videoKey?: string } & Partial<ReelPlan>) | undefined;
    const plan = ReelPlan.safeParse(body);
    const r = i.renders[0];
    return {
      id: i.id, title: i.title, status: i.status, version: i.versions[0]?.version ?? 0, postUrl: i.postUrl, createdAt: i.createdAt,
      render: r ? { step: r.step, attempt: r.attempt, failure: renderFailure(r) } : null,
      seconds: plan.success ? reelSeconds(plan.data) : null,
      price: plan.success ? reelPrice(plan.data) : null,
      thumbUrl: plan.success ? await signedMediaUrl(plan.data.scenes[0].photoKey, 3600) : null,
      videoUrl: body?.videoKey ? await signedMediaUrl(body.videoKey, 3600) : null,
    };
  }));
}

export async function reelDetail(scope: Omit<Scope, "userId">, itemId: string) {
  const item = await prisma.contentItem.findFirst({
    where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId, studio: true },
    include: { versions: { orderBy: { version: "desc" }, take: 1, include: { checks: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  });
  if (!item) throw new PublishingError("Reel not found", 404);
  const latest = item.versions[0];
  const body = latest?.body as { videoKey?: string } | undefined;
  const plan = ReelPlan.safeParse(latest?.body);
  const [videoUrl, renders, credits] = await Promise.all([body?.videoKey ? signedMediaUrl(body.videoKey, 3600) : null, renderView(item.id), creditBalance(scope.workspaceId)]);
  return {
    item: { id: item.id, title: item.title, status: item.status, postUrl: item.postUrl, scheduledFor: item.scheduledFor },
    version: latest?.version ?? 0,
    plan: plan.success ? plan.data : null,
    price: plan.success ? reelPrice(plan.data) : null,
    caption: (latest?.body as { caption?: string; hashtags?: string[] } | undefined) ?? null,
    videoUrl,
    checks: latest?.checks[0] ? { overall: latest.checks[0].overall, results: latest.checks[0].results } : null,
    renders,
    chat: chatOf(item.brief),
    credits,
    // Scene photos are private storage keys; the app shows them through short-lived links.
    photoUrls: plan.success ? Object.fromEntries(await Promise.all([...new Set(plan.data.scenes.map((x) => x.photoKey))].map(async (k) => [k, await signedMediaUrl(k, 3600)] as const))) : {},
  };
}
