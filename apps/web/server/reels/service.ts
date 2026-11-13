import type { Prisma } from "@prisma/client";
import { fromAccessError, problemResponse } from "@/server/api/http-error";
import { registerManualPost } from "@/server/services/manual-post";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { startAgentRun } from "@/server/agents/engine";
import { kickRunner } from "@/server/jobs/runner";
import { brandKnowledge, productPhotos } from "@/server/content/knowledge";
import { prisma } from "@/server/db/prisma";
import { directScenes, type DraftSoFar, type ReelPhoto, writePlan } from "@/server/reels/agents";
import { planOwnershipProblems } from "@/server/reels/ownership";
import { aiDisclosureLine, carryStandIns, clearPresenterFlags, needsAiDisclosure, isStudioPlan, planProblems, presenterCuts, ReelPlan, reelPrice, reelSeconds, sceneSeconds, toVersionBody } from "@/server/reels/plan";
import { donePresenter } from "@/server/reels/presenters";
import { settleRecordings } from "@/server/reels/recordings";
import { renderFailure, renderView } from "@/server/reels/render";
import { templateById } from "@/server/reels/templates";
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
  if (error instanceof PublishingError) return problemResponse({ type: "https://api.brandpilot/errors/reels", title: error.message, status: error.status, detail: error.message, code: error.code });
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

/**
 * A template (R12) is an instruction to the scriptwriter: its `ask` is what's sent, and the person's turn in the chat
 * is what the phone sent (the template's title in the app's language), else the English title.
 */
export function templateAsk(templateId: string | undefined, message: string | undefined) {
  if (!templateId) return { ask: message, turn: message, template: undefined };
  const template = templateById(templateId);
  if (!template) throw new PublishingError("Unknown template", 400);
  return { ask: template.ask, turn: message ?? template.title, template: template.id };
}

export async function createReel(scope: Scope, input: { opportunityId?: string; prompt?: string; language?: string; templateId?: string }, emit?: Emit) {
  const { ask, turn, template } = templateAsk(input.templateId, input.prompt);
  emit?.({ type: "stage", stage: "reading" });
  const idea = input.opportunityId
    ? await prisma.opportunity.findFirst({ where: { id: input.opportunityId, workspaceId: scope.workspaceId, brandId: scope.brandId } })
    : null;
  if (input.opportunityId && !idea) throw new PublishingError("Idea not found", 404);
  const photos = await brandPhotos(scope);
  if (photos.length === 0) throw new PublishingError("Add product photos first (Select assets), then plan a reel.", 400);
  const { text: knowledge } = await brandKnowledge(scope.workspaceId, scope.brandId, 3000);
  emit?.({ type: "stage", stage: "writing" });
  const written = await writePlan(scope, { knowledge, photos, idea: idea ?? undefined, message: ask, replyLanguage: input.language, onDraft: emit && ((d) => emit({ type: "draft", ...d })) });
  const { reply } = written;
  const plan = template ? { ...written.plan, template } : written.plan;
  const ready = await directed(scope, plan, undefined, emit); // a new plan has no presenter
  const now = new Date().toISOString();
  const chat: ChatTurn[] = [...(turn ? [{ role: "user" as const, text: turn.slice(0, 2000), at: now }] : []), { role: "assistant", text: reply, at: now }];
  const item = await prisma.contentItem.create({
    data: {
      workspaceId: scope.workspaceId, brandId: scope.brandId, opportunityId: idea?.id ?? null, title: ready.title, channel: "INSTAGRAM_REEL", studio: true, status: "PLANNED",
      brief: { reelChat: chat } as Prisma.InputJsonValue,
      versions: { create: { version: 1, body: toVersionBody(ready), createdBy: scope.userId } },
    },
  });
  return { id: item.id, version: 1, plan: ready, price: reelPrice(ready), reply };
}

const PRESENTER_ASK = "The brand's presenter now appears in this reel: pick the scenes they speak on camera (presenter: true), keeping the script unless a line needs to suit a person speaking.";

/**
 * R04: the person says what they want (or what's wrong with the video); the scriptwriter revises the plan.
 * A template (R12) or a presenter (R10) is sent the same way, with `message` its name in the app's language.
 */
export async function chatPlan(scope: Scope, itemId: string, input: { version: number; message?: string; language?: string; templateId?: string; presenterId?: string }, emit?: Emit) {
  const picked = input.presenterId ? await donePresenter(scope, input.presenterId) : null;
  if (input.presenterId && !picked) throw new PublishingError("Presenter not found", 404);
  const { ask, turn, template } = picked
    ? { ask: PRESENTER_ASK, turn: input.message ?? (picked.input as { name: string }).name, template: undefined }
    : templateAsk(input.templateId, input.message);
  emit?.({ type: "stage", stage: "reading" });
  const { item, latest } = await loadReel(scope, itemId);
  const saved = isStudioPlan(latest?.body) ? ReelPlan.parse(latest!.body) : undefined;
  if (picked && !saved) throw new PublishingError("Plan the reel first, then add a presenter.", 400);
  const current = saved && picked ? { ...saved, presenter: picked.id } : saved;
  // Before paying for the scriptwriter: a plan naming a removed presenter is refused until another is picked.
  const owned = current ? await planOwnershipProblems(current, scope) : [];
  if (owned.length) throw new PublishingError(owned.join(" "), 400);
  const [photos, { text: knowledge }] = await Promise.all([brandPhotos(scope, current), brandKnowledge(scope.workspaceId, scope.brandId, 3000)]);
  const chat = chatOf(item.brief);
  emit?.({ type: "stage", stage: "writing" });
  const written = await writePlan(scope, { knowledge, photos, current, chat, message: ask, replyLanguage: input.language, onDraft: emit && ((d) => emit({ type: "draft", ...d })) });
  const { reply } = written;
  const settled = await settleRecordings(template ? { ...written.plan, template } : written.plan, current, itemId, true);
  const plan = settled.plan;
  const ready = presenterCuts(await directed(scope, carryStandIns(plan, current, true), current, emit));
  const now = new Date().toISOString();
  // A recording the revision dropped is said in the reply, where the person reads the chat.
  const said = [reply, ...settled.notices].join("\n");
  const v = await savePlan(scope, itemId, input.version, ready, [...chat, { role: "user", text: (turn ?? "").slice(0, 2000), at: now }, { role: "assistant", text: said, at: now }]);
  return { version: v.version, plan: ready, price: reelPrice(ready), reply, droppedRecordings: settled.dropped };
}

/** R10–R13 / R03 edits. `droppedRecordings`: scene numbers whose recording was dropped (their text changed). */
export async function editPlan(scope: Scope, itemId: string, input: { version: number; plan: ReelPlan }) {
  const { latest } = await loadReel(scope, itemId);
  const previous = isStudioPlan(latest?.body) ? ReelPlan.parse(latest!.body) : undefined;
  const { plan, dropped } = await settleRecordings(clearPresenterFlags(input.plan), previous, itemId, false);
  const problems = [...planProblems(plan, scope), ...(await planOwnershipProblems(plan, scope))];
  if (problems.length) throw new PublishingError(problems.join(" "), 400);
  const ready = presenterCuts(await directed(scope, carryStandIns(plan, previous, false), previous));
  const v = await savePlan(scope, itemId, input.version, ready);
  return { version: v.version, plan: ready, price: reelPrice(ready), droppedRecordings: dropped };
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

const CHECK_IN_FLIGHT_MS = 5 * 60_000;

/**
 * The Quality check a finished render should get (render.ts starts it, but a missed start is not retried there).
 * Called only by the app, from the reel route's recheck action (content.create): once automatically after a while with
 * no checks, and from its "Check again" button. "checking" = a run is already in flight; "none" = nothing to check.
 * Capped at one per 15 s per reel and 10 an hour per brand.
 * ponytail: the in-flight test reads agent runs; a column on the render would be cheaper if this gets hot.
 */
export async function recheckQuality(scope: Omit<Scope, "userId">, itemId: string): Promise<"started" | "checking" | "none"> {
  const item = await prisma.contentItem.findFirst({
    where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId, studio: true },
    include: { versions: { orderBy: { version: "desc" }, take: 1, include: { checks: { select: { id: true }, take: 1 } } } },
  });
  const latest = item?.versions[0];
  if (!item || !latest || item.status !== "DRAFT_REVIEW" || latest.checks.length > 0) return "none";
  const since = new Date(Date.now() - CHECK_IN_FLIGHT_MS);
  const inFlight = await prisma.agentRun.findFirst({
    where: { brandId: scope.brandId, agentKey: "quality", status: { in: ["QUEUED", "RUNNING"] }, createdAt: { gt: since }, input: { path: ["itemId"], equals: itemId } },
    select: { id: true },
  });
  if (inFlight) return "checking";
  const [perReel, perBrand] = await Promise.all([hitRateLimit(`reel-recheck:${itemId}`, 1, 15_000), hitRateLimit(`reel-recheck-brand:${scope.brandId}`, 10, 3600_000)]);
  if (!perReel.allowed || !perBrand.allowed) throw new PublishingError("Too many checks just now. Try again in a moment.", 429);
  await startAgentRun({ ...scope, agentKey: "quality", trigger: "event", input: { itemId, version: latest.version } });
  kickRunner();
  return "started";
}

/** After a manual post: the link the person pasted back, so the reel's results can be followed. */
export const registerPostLink = (scope: Scope, itemId: string, url: string) => registerManualPost(scope, itemId, url, "reel");

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
    // Lengths come from here, never from a formula in the app (recorded scenes take their recording's length).
    seconds: plan.success ? reelSeconds(plan.data) : null,
    // Shown to approvers under the caption, read-only: publishing adds it (postText).
    aiDisclosure: plan.success && needsAiDisclosure(plan.data) ? aiDisclosureLine(plan.data.language) : null,
    sceneSeconds: plan.success ? plan.data.scenes.map(sceneSeconds) : [],
    caption: (latest?.body as { caption?: string; hashtags?: string[] } | undefined) ?? null,
    videoUrl,
    // The video on screen, as a story frame's source (stories/sources.ts resolves a reel by its videoKey).
    videoKey: body?.videoKey ?? null,
    checks: latest?.checks[0] ? { overall: latest.checks[0].overall, results: latest.checks[0].results } : null,
    renders,
    chat: chatOf(item.brief),
    credits,
    // Scene photos are private storage keys; the app shows them through short-lived links.
    photoUrls: plan.success ? Object.fromEntries(await Promise.all([...new Set(plan.data.scenes.map((x) => x.photoKey))].map(async (k) => [k, await signedMediaUrl(k, 3600)] as const))) : {},
  };
}
