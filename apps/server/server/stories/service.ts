import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { startAgentRun } from "@/server/agents/engine";
import { hitRateLimit } from "@/server/auth/rate-limit";
import { prisma } from "@/server/db/prisma";
import { enqueueJob } from "@/server/jobs/queue";
import { liveOfferFor } from "@/server/content/knowledge";
import { CREDIT_COSTS, InsufficientCreditsError, refundCharge, spendCredits } from "@/server/services/credits";
import { APP_GOALS, EDITABLE, lock, PublishingError, TX } from "@/server/services/publishing";
import { getMediaBytes, signedMediaUrl } from "@/server/storage/media";
import { isStoryBody, LOGO_MAX_BYTES, MIN_CLIP_SECONDS, REEL_SIZE, type StoryBody, type StoryFrame, type StoryFrameInput, type StoryInput } from "@/server/stories/body";
import { posterKeyFor, renderClipFrame, renderPhotoFrame, type RenderOpts, textFits } from "@/server/stories/render";
import { resolveSource } from "@/server/stories/sources";

/**
 * Saving a story (design "One render step"): every version is created by `createStoryVersion`, after all its frames
 * are rendered. Photo-only stories render in the request; a story with a clip renders in the job queue, one clip per
 * run (a clip can take up to ~4 minutes with its retry encode), then its photos, then the version.
 */
export const STORY_RENDER_JOB = "story.render";

const HOUR = 3_600_000;
/** A clip window must leave at least this much of the clip (the renderer refuses shorter output too). */

type BrandScope = { workspaceId: string; brandId: string };
type Scope = BrandScope & { userId: string };
type Db = Prisma.TransactionClient | typeof prisma;
type StoryActor = { kind: "person"; userId: string } | { kind: "agent"; runId: string; model?: string; chargeId?: string };
/** What the brand's frames look like beyond their own content: fixed for one save, so every frame of it agrees. */
type Look = { language: string; logoKey?: string; logoTag?: string };
type Settings = Pick<StoryBody, "cta" | "link" | "brandMark">;
type RenderPayload = BrandScope & Settings & Look & {
  itemId: string; baseVersion: number; frames: StoryFrame[]; actor: StoryActor;
  /** The next frame index to look at for a clip. */
  next: number;
  /** One per save: the follow-up jobs' idempotency keys, so a retried step can't queue its successor twice. */
  renderId: string;
  /** The item's status when it was saved: an approval that lands while the frames render refuses the version. */
  statusAtSave: string;
};

const notFound = () => new PublishingError("Story not found", 404, "story.notFound");
const notEditable = () => new PublishingError("This story can't be edited any more.", 409, "story.notEditable");
const byHandOn = () => new PublishingError("This story is set to be posted by hand. Stop posting by hand first, so nobody posts the old frames.", 409, "story.byHandOn");
const stale = () => new PublishingError("Someone else changed this story. Your changes weren't saved.", 409, "story.stale");
const renderLimit = () => new PublishingError("Too many story saves this hour. Try again later.", 429, "story.renderLimit");

/** The story, scoped to the brand; any other item (another brand's, or a post) is "not found". */
async function loadStory(db: Db, scope: BrandScope, itemId: string) {
  const item = await db.contentItem.findFirst({
    where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId },
    include: { versions: { orderBy: { version: "desc" }, take: 1 } },
  });
  if (!item || item.channel !== "INSTAGRAM_STORY") throw notFound();
  return { item, latest: item.versions[0] ?? null };
}

/**
 * An approved story can be edited (the new version goes back to review), but one approved after the save started
 * can't: the person approving saw the old frames, and a silent new version would void what they just approved.
 * Nor can one set to be posted by hand: its frames may already be downloaded, and an edit would void the approval
 * behind "I posted it" (like a scheduled story, it has to be taken off first).
 */
function assertEditable(item: { status: string; byHand: boolean }, latestVersion: number, baseVersion: number, statusAtSave?: string) {
  const { status } = item;
  if (!EDITABLE.includes(status)) throw notEditable();
  if (status === "APPROVED" && item.byHand) throw byHandOn();
  if (status === "APPROVED" && statusAtSave !== undefined && statusAtSave !== "APPROVED") throw notEditable();
  if (latestVersion !== baseVersion) throw stale();
}

/**
 * A person's or an agent's save. Client input carries no server fields (parseStoryInput strips them); frames are
 * rebuilt here field by field anyway, so only keys from `resolveSource` ever reach the renderer or the version.
 * Rate limits come first, so refused saves count too (each costs a lookup and possibly a product photo fetch).
 */
export async function saveStoryVersion(
  scope: Scope,
  itemId: string,
  baseVersion: number,
  input: StoryInput,
  actor: StoryActor,
  /** keepEmpty: the agent's frames without a source (too few photos) are kept, unrendered, for a person to fill. */
  opts: { photosOnly?: boolean; keepEmpty?: boolean } = {},
): Promise<{ status: "saved"; version: number } | { status: "rendering" }> {
  if (actor.kind === "person" && !(await hitRateLimit(`story-render:user:${actor.userId}`, 30, HOUR)).allowed) throw renderLimit();
  if (!(await hitRateLimit(`story-render:brand:${scope.brandId}`, 100, HOUR)).allowed) throw renderLimit();
  const { item, latest } = await loadStory(prisma, scope, itemId);
  // Checked again under the lock when the version is created; refusing now saves the render.
  assertEditable(item, latest?.version ?? 0, baseVersion);

  const frames: StoryFrame[] = [];
  for (const [i, f] of input.frames.entries()) frames.push(!f.source && opts.keepEmpty ? textOnly(f) : await resolveFrame(scope, f, i, opts));
  frames.forEach((f, i) => {
    const fit = textFits(f, i === frames.length - 1, input.cta);
    if (!fit.fits) throw new PublishingError(`Frame ${i + 1}: the ${fit.field} doesn't fit.`, 400, "story.textFit");
  });
  const settings: Settings = { cta: input.cta, link: input.link, brandMark: input.brandMark };
  const look = await brandLook(scope, input.brandMark);

  if (frames.some((f) => f.mediaKind === "video")) {
    const payload: RenderPayload = { workspaceId: scope.workspaceId, brandId: scope.brandId, itemId, baseVersion, frames, ...settings, ...look, actor, next: 0, renderId: randomUUID(), statusAtSave: item.status };
    await queueStep(payload);
    return { status: "rendering" };
  }
  const rendered = await renderPhotos(scope, frames, settings, look);
  const version = await prisma.$transaction((tx) => createStoryVersion(tx, scope, itemId, baseVersion, { frames: rendered, ...settings, hook: "", productIds: [] }, actor, { statusAtSave: item.status }), TX);
  return { status: "saved", version: version.version };
}

/** A frame with text and no picture yet (Quality's "Frames" check blocks it until a person adds one). */
const textOnly = (f: StoryFrameInput): StoryFrame => ({
  label: f.label, headline: f.headline, body: f.body, ...(f.composition === undefined ? {} : { composition: f.composition }),
});

async function resolveFrame(scope: Scope, f: StoryFrameInput, i: number, opts: { photosOnly?: boolean }): Promise<StoryFrame> {
  if (!f.source) throw new PublishingError(`Frame ${i + 1} has no photo or clip.`, 400, "story.source", { n: i + 1 });
  const r = await resolveSource(scope, f.source, opts);
  const clip = r.mediaKind === "video" ? (f.clip ?? { start: 0, sound: true }) : undefined;
  if (clip && r.durationSec !== undefined && clip.start + MIN_CLIP_SECONDS > r.durationSec) {
    throw new PublishingError(`Frame ${i + 1}: the chosen part starts after the clip ends.`, 400, "story.clipWindow", { n: i + 1 });
  }
  return {
    source: { kind: f.source.kind, id: f.source.id },
    label: f.label,
    headline: f.headline,
    body: f.body,
    ...(f.composition === undefined ? {} : { composition: f.composition }),
    ...(f.crop ? { crop: { x: f.crop.x, y: f.crop.y, scale: f.crop.scale } } : {}),
    ...(clip ? { clip: { start: clip.start, sound: clip.sound } } : {}),
    mediaKey: r.mediaKey,
    mediaKind: r.mediaKind,
    aiMark: r.aiMark,
    rights: r.rights,
  };
}

const LogoAsset = z.object({ logo: z.object({ key: z.string() }).nullable().optional() });

/**
 * The brand's content language (as posts read it: the first of `locales`) and, with the brand mark on, the brand's own
 * logo from Research's assets. The logo's identity is a hash of its bytes, so replacing it re-renders every frame.
 * A logo that can't be read renders the frame without it rather than failing the save.
 */
async function brandLook(scope: BrandScope, brandMark: boolean): Promise<Look> {
  const profile = await prisma.brandProfile.findFirst({ where: { brandId: scope.brandId, workspaceId: scope.workspaceId }, select: { locales: true, assets: true } });
  const language = z.array(z.string()).safeParse(profile?.locales).data?.[0] ?? "en";
  const key = brandMark ? LogoAsset.safeParse(profile?.assets).data?.logo?.key : undefined;
  if (!key || !key.startsWith(`${scope.workspaceId}/${scope.brandId}/`) || key.includes("..")) return { language };
  const bytes = await getMediaBytes(key, LOGO_MAX_BYTES).catch(() => null);
  if (!bytes) return { language };
  return { language, logoKey: key, logoTag: createHash("sha256").update(bytes).digest("hex").slice(0, 16) };
}

const renderOpts = (scope: BrandScope, i: number, count: number, s: Settings, look: Look): RenderOpts => ({
  scope: { workspaceId: scope.workspaceId, brandId: scope.brandId },
  language: look.language,
  isLast: i === count - 1,
  cta: s.cta,
  brandMark: s.brandMark,
  ...(look.logoKey ? { logoKey: look.logoKey, logoTag: look.logoTag } : {}),
  n: i + 1,
});

/** Renders every photo frame (content-addressed: an unchanged frame reuses its file). Clip and empty frames pass through. */
async function renderPhotos(scope: BrandScope, frames: StoryFrame[], s: Settings, look: Look): Promise<StoryFrame[]> {
  const out: StoryFrame[] = [];
  for (const [i, f] of frames.entries()) {
    if (f.mediaKind === "video" || !f.mediaKey) {
      out.push(f);
      continue;
    }
    const { key, file } = await renderPhotoFrame(f, renderOpts(scope, i, frames.length, s, look));
    out.push({ ...f, renderedKey: key, file });
  }
  return out;
}

async function queueStep(p: RenderPayload) {
  await enqueueJob({
    type: STORY_RENDER_JOB, workspaceId: p.workspaceId, brandId: p.brandId, payload: p as unknown as Prisma.InputJsonValue, maxAttempts: 2,
    idempotencyKey: `story-render:${p.renderId}:${p.next}`,
  });
}

/**
 * Creates the story version, in the caller's transaction. Under the per-post lock it re-reads the item (scoped) and
 * refuses if it was scheduled or published meanwhile (approved too, given `statusAtSave`), or if someone saved another
 * version. The caller starts Quality afterwards.
 */
export async function createStoryVersion(tx: Prisma.TransactionClient, scope: BrandScope, itemId: string, baseVersion: number, body: StoryBody, actor: StoryActor, opts: { statusAtSave?: string; renderId?: string } = {}) {
  await lock(tx, itemId);
  const { item, latest } = await loadStory(tx, scope, itemId);
  assertEditable(item, latest?.version ?? 0, baseVersion, opts.statusAtSave);
  if (body.frames.some((f) => f.source && (!f.renderedKey || !f.mediaKey))) throw new Error("Story frames must be rendered before a version is saved");
  const previous = (latest?.body ?? null) as { productIds?: unknown } | null;
  const productIds = Array.isArray(previous?.productIds) ? (previous.productIds as string[]) : item.productIds;
  const stored: StoryBody & { renderId?: string } = {
    frames: body.frames, cta: body.cta, link: body.link, brandMark: body.brandMark, hook: body.frames[0]?.headline ?? "", productIds,
    // Server-owned: lets a retried final job step recognise the version it already made.
    ...(opts.renderId ? { renderId: opts.renderId } : {}),
  };
  const version = await tx.contentVersion.create({
    data: {
      contentItemId: item.id, version: baseVersion + 1, body: stored as unknown as Prisma.InputJsonValue,
      ...(actor.kind === "person" ? { createdBy: actor.userId } : { createdBy: "agent", agentRunId: actor.runId, model: actor.model ?? null }),
    },
  });
  // A new version voids any approval; a by-hand plan was for the old one.
  await tx.contentItem.update({ where: { id: item.id }, data: { status: "DRAFT_REVIEW", byHand: false } });
  await tx.auditEvent.create({
    data: {
      workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: actor.kind === "person" ? actor.userId : null,
      action: "content.edit", entityType: "ContentItem", entityId: item.id,
      metadata: { version: version.version, from: item.status, ...(actor.kind === "agent" ? { agentRunId: actor.runId } : {}) },
    },
  });
  return version;
}

/**
 * Job handler: renders the next clip frame and queues the next step with the result in its payload; once no clip is
 * left, renders the photos, saves the version and starts Quality. Every step first checks the story is still editable
 * at the same version, so a story approved or re-saved meanwhile stops before more encoding. Refusals (PublishingError)
 * aren't retried (runner.ts); the message lands in Job.lastError for `storyRenderState`.
 */
export async function runStoryRender(payload: unknown) {
  try {
    await renderStep(payload as RenderPayload);
  } catch (e) {
    throw e instanceof PublishingError ? new StoryRenderRefused(e) : e;
  }
}

/**
 * A refusal, as the job queue stores it (`String(error)` → Job.lastError): a marker and its code and message as JSON,
 * so `storyRenderState` shows refusals word for word and anything else (ffmpeg or sharp text, temp paths) never.
 */
const REFUSED = "story-refused:";
class StoryRenderRefused extends PublishingError {
  constructor(e: PublishingError) {
    super(e.message, e.status, e.code, e.data);
  }
  override toString() {
    return REFUSED + JSON.stringify({ code: this.code ?? null, message: this.message, data: this.data ?? null });
  }
}

async function renderStep(p: RenderPayload) {
  const scope = { workspaceId: p.workspaceId, brandId: p.brandId };
  const { item, latest } = await loadStory(prisma, scope, p.itemId);
  // A retried final step whose version was committed (the job died before completing): only Quality may be left to
  // start. Not when the version is already checked; a run still going for it is joined by startAgentRun.
  if (latest?.version === p.baseVersion + 1 && (latest.body as { renderId?: unknown } | null)?.renderId === p.renderId) {
    const checked = await prisma.qualityCheck.findFirst({ where: { contentVersionId: latest.id }, select: { id: true } });
    if (!checked) await startAgentRun({ workspaceId: p.workspaceId, brandId: p.brandId, agentKey: "quality", trigger: "event", input: { itemId: p.itemId, version: latest.version } }).catch(() => null);
    return;
  }
  assertEditable(item, latest?.version ?? 0, p.baseVersion, p.statusAtSave);
  const frames = [...p.frames];
  let i = p.next;
  while (i < frames.length && frames[i].mediaKind !== "video") i++;
  if (i < frames.length) {
    const { key, file } = await renderClipFrame(frames[i], renderOpts(scope, i, frames.length, p, p));
    frames[i] = { ...frames[i], renderedKey: key, file };
    await queueStep({ ...p, frames, next: i + 1 });
    return;
  }
  const rendered = await renderPhotos(scope, frames, p, p);
  const body = { frames: rendered, cta: p.cta, link: p.link, brandMark: p.brandMark, hook: "", productIds: [] };
  const version = await prisma.$transaction((tx) => createStoryVersion(tx, scope, p.itemId, p.baseVersion, body, p.actor, { statusAtSave: p.statusAtSave, renderId: p.renderId }), TX);
  await startAgentRun({ workspaceId: p.workspaceId, brandId: p.brandId, agentKey: "quality", trigger: "event", input: { itemId: p.itemId, version: version.version } }).catch(() => null);
}

/** Job onFailure: an agent's paid story is refunded when its render finally fails (refundCharge is idempotent). */
export async function onStoryRenderFailure(payload: unknown, _error: unknown, exhausted: boolean) {
  const p = payload as Pick<RenderPayload, "workspaceId" | "actor">;
  if (exhausted && p.actor?.kind === "agent" && p.actor.chargeId) await refundCharge(p.workspaceId, p.actor.chargeId);
}

const RENDER_FAILED = { error: "The clip couldn't be rendered. Try again.", errorCode: "story.renderFailed" };

/** A failed job's lastError as people may see it: refusals word for word, anything else generic. */
type RenderFailure = { error: string; errorCode: string; errorData?: Record<string, unknown> };
function renderFailure(lastError: string | null): RenderFailure {
  if (!lastError?.startsWith(REFUSED)) return RENDER_FAILED;
  try {
    const r = JSON.parse(lastError.slice(REFUSED.length)) as { code?: unknown; message?: unknown; data?: unknown };
    if (typeof r.message !== "string") return RENDER_FAILED;
    const errorData = r.data && typeof r.data === "object" ? (r.data as Record<string, unknown>) : undefined;
    return { error: r.message, errorCode: typeof r.code === "string" ? r.code : RENDER_FAILED.errorCode, ...(errorData ? { errorData } : {}) };
  } catch {
    return RENDER_FAILED; // cut off at 2000 characters
  }
}

/**
 * Whether a render is under way for this story, else the newest failed render a person saved from the latest version
 * (an older save's failure no longer matters once a newer version exists; an agent's failed rewrite isn't the person's
 * to fix, and its paid charge is refunded by onStoryRenderFailure).
 * ponytail: matches jobs by a JSON path on the payload (no index); fine while render jobs are few. Add an itemId
 * column on Job if this shows up in query times.
 */
export async function storyRenderState(scope: BrandScope, itemId: string): Promise<{ rendering: boolean } & Partial<RenderFailure>> {
  const where = { type: STORY_RENDER_JOB, workspaceId: scope.workspaceId, brandId: scope.brandId, payload: { path: ["itemId"], equals: itemId } };
  const busy = await prisma.job.findFirst({ where: { ...where, status: { in: ["PENDING", "RUNNING"] } }, select: { id: true } });
  if (busy) return { rendering: true };
  const latest = await prisma.contentVersion.findFirst({ where: { contentItemId: itemId, item: { workspaceId: scope.workspaceId, brandId: scope.brandId } }, orderBy: { version: "desc" }, select: { version: true } });
  const failed = await prisma.job.findFirst({
    where: { type: STORY_RENDER_JOB, workspaceId: scope.workspaceId, brandId: scope.brandId, status: "DEAD_LETTER", AND: [{ payload: { path: ["itemId"], equals: itemId } }, { payload: { path: ["baseVersion"], gte: latest?.version ?? 0 } }, { payload: { path: ["actor", "kind"], equals: "person" } }] },
    orderBy: { updatedAt: "desc" },
    select: { lastError: true },
  });
  return failed ? { rendering: false, ...renderFailure(failed.lastError) } : { rendering: false };
}

export type StoryTab = "drafts" | "scheduled" | "posted";
/** Which P07 tab a story sits in. Any partly posted or unverified attempt counts as posted (someone has to look). */
export function storyTab(item: { status: string; byHand: boolean }, attempts: { status: string }[]): StoryTab {
  if (item.status === "PUBLISHED" || item.status === "REVIEWED" || attempts.some((a) => a.status === "PARTIAL" || a.status === "PENDING_VERIFY")) return "posted";
  if (item.status === "SCHEDULED" || (item.status === "APPROVED" && item.byHand)) return "scheduled";
  return "drafts";
}

/** The rendered frame's URL (an hour), only for files under this brand's stories folder. */
export function renderedUrl(scope: BrandScope, key: string | undefined) {
  return key && key.startsWith(`${scope.workspaceId}/${scope.brandId}/stories/`) && !key.includes("..") ? signedMediaUrl(key, 3600) : null;
}

/** A story's list thumbnail: frame 1's rendered picture, or its poster JPEG when frame 1 is a clip. */
export function coverUrl(scope: BrandScope, key: string | undefined) {
  return renderedUrl(scope, key?.endsWith(".mp4") ? posterKeyFor(key) : key);
}

/** What the story screens add to the post state: render progress and the latest version's frames. */
export async function storyView(scope: BrandScope, itemId: string) {
  const [state, latest] = await Promise.all([
    storyRenderState(scope, itemId),
    prisma.contentVersion.findFirst({ where: { contentItemId: itemId, item: { workspaceId: scope.workspaceId, brandId: scope.brandId } }, orderBy: { version: "desc" }, select: { body: true } }),
  ]);
  const frames = isStoryBody(latest?.body) ? latest.body.frames : [];
  // A clip's upright size (probe.ts turns quarter-rotated streams), so the phone crops the shape the renderer cuts.
  const clipKeys = frames.filter((f) => f.mediaKind === "video" && f.source?.kind === "upload" && f.mediaKey).map((f) => f.mediaKey!);
  const uploads = clipKeys.length
    ? await prisma.mediaUpload.findMany({ where: { workspaceId: scope.workspaceId, brandId: scope.brandId, key: { in: clipKeys } }, select: { key: true, width: true, height: true } })
    : [];
  const sourceSize = (f: StoryFrame) => {
    if (f.mediaKind !== "video") return null;
    if (f.source?.kind === "reel") return REEL_SIZE;
    const u = uploads.find((x) => x.key === f.mediaKey);
    return u?.width && u.height ? { width: u.width, height: u.height } : null;
  };
  return {
    rendering: state.rendering,
    renderError: state.error ?? null,
    renderErrorCode: state.errorCode ?? null,
    // Fields for the app's own wording of the refusal (a frame's number).
    renderErrorData: state.errorData ?? null,
    frames: await Promise.all(
      frames.map(async (f, i) => ({
        n: i + 1,
        url: await renderedUrl(scope, f.renderedKey),
        // The untouched photo or clip, so the phone editor can preview new text, crop and trim without the old text
        // burned in. The phone reads a clip's length from its player.
        sourceUrl: await sourceUrl(scope, f.mediaKey),
        sourceSize: sourceSize(f),
        kind: f.mediaKind ?? null,
        headline: f.headline,
      })),
    ),
  };
}

/** A frame's source photo or clip URL (an hour), only for files under this brand's folder. */
function sourceUrl(scope: BrandScope, key: string | undefined) {
  return key && key.startsWith(`${scope.workspaceId}/${scope.brandId}/`) && !key.includes("..") ? signedMediaUrl(key, 3600) : null;
}

/**
 * A new planned story with a copy of the latest version, without its rendered files (the next save renders it again).
 * The copy keeps each frame's source and resolved mediaKey, so the upload sweep still sees the file as used.
 */
export async function duplicateStory(scope: Scope, itemId: string) {
  const { item, latest } = await loadStory(prisma, scope, itemId);
  const body = isStoryBody(latest?.body) ? latest.body : null;
  return prisma.$transaction(async (tx) => {
    const copy = await tx.contentItem.create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, title: item.title, channel: item.channel, status: "PLANNED", productIds: item.productIds, opportunityId: item.opportunityId },
    });
    if (body) {
      const frames = body.frames.map(({ renderedKey: _r, file: _f, ...f }) => f);
      await tx.contentVersion.create({ data: { contentItemId: copy.id, version: 1, body: { ...body, frames } as unknown as Prisma.InputJsonValue, createdBy: scope.userId } });
    }
    await tx.auditEvent.create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "content.create", entityType: "ContentItem", entityId: copy.id, metadata: { channel: item.channel, duplicateOf: item.id } },
    });
    return copy;
  }, TX);
}

/** Deletes a story still in the Drafts tab (its versions, decisions and attempts cascade). */
export async function deleteStory(scope: Scope, itemId: string) {
  await prisma.$transaction(async (tx) => {
    await lock(tx, itemId);
    const { item } = await loadStory(tx, scope, itemId);
    const attempts = await tx.publicationAttempt.findMany({ where: { contentItemId: item.id, status: { in: ["PARTIAL", "PENDING_VERIFY"] } }, select: { status: true } });
    if (storyTab(item, attempts) !== "drafts") throw new PublishingError("Only draft stories can be deleted.", 409, "story.notDeletable");
    await tx.contentItem.delete({ where: { id: item.id } });
    await tx.auditEvent.create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "content.delete", entityType: "ContentItem", entityId: item.id, metadata: { channel: item.channel, status: item.status } },
    });
  }, TX);
}

const STORY_GOALS = ["newArrival", "productFeature", "specialOffer"] as const;
export const STORY_START_NOTE = "Writing didn't start. Try again.";
const noCredits = () => new PublishingError("Not enough credits to write a story.", 402, "story.credits");
/** Brand-scoped and prefixed, so another brand's (or feature's) id can never match this charge in spendCredits/refundCharge. */
const chargeRef = (brandId: string, requestId: string) => `story:${brandId}:${requestId}`;

/** The story already made for this request id in this brand, if it still exists. */
export async function storyForRequest(scope: BrandScope, requestId: string, db: Db = prisma) {
  return db.contentItem.findFirst({
    where: { workspaceId: scope.workspaceId, brandId: scope.brandId, channel: "INSTAGRAM_STORY", brief: { path: ["requestId"], equals: requestId } },
    select: { id: true },
  });
}

/**
 * The app's "New story": 5 credits, charged once per request id (refId is brand-scoped), so a double tap or a retried
 * request pays once and gets the same item back (`repeated`). The caller then starts the Creator with
 * `prepaidChargeId: chargeId` and calls `failStoryStart` if that throws.
 * A request id whose story was deleted, or whose charge was refunded, is spent: 409 story.requestUsed (else a repeat would
 * get a free story on the old charge). A crash between the charge and the item is picked up by the same request id;
 * a crash between the item and the run leaves a BRIEF_READY story whose "Fix it" prepays with the held charge.
 */
export async function createStory(scope: Scope, input: { goal: (typeof STORY_GOALS)[number]; productId: string; direction?: string; requestId: string }) {
  const product = await prisma.product.findFirst({ where: { id: input.productId, workspaceId: scope.workspaceId, brandId: scope.brandId, archivedAt: null }, select: { id: true, title: true } });
  if (!product) throw new PublishingError("That product isn't in this brand.", 400, "story.product");
  const campaignId = input.goal === "specialOffer" ? await liveOfferFor(scope, [product.id]) : null;
  const direction = input.direction?.trim() ?? "";
  const refId = chargeRef(scope.brandId, input.requestId);
  return prisma.$transaction(async (tx) => {
    // Two requests with one id at once: the second waits here, then finds the first's item.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`story-create:${scope.workspaceId}:${refId}`}))`;
    const existing = await storyForRequest(scope, input.requestId, tx);
    if (existing) return { id: existing.id, chargeId: refId, repeated: true };
    const charged = await tx.creditEntry.findFirst({ where: { workspaceId: scope.workspaceId, reason: "story-write", refId }, select: { id: true } });
    if (charged) {
      const refunded = await tx.creditEntry.findFirst({ where: { workspaceId: scope.workspaceId, reason: "refund", refId }, select: { id: true } });
      const made = await tx.auditEvent.findFirst({
        where: { workspaceId: scope.workspaceId, brandId: scope.brandId, action: "content.create", entityType: "ContentItem", metadata: { path: ["requestId"], equals: input.requestId } },
        select: { id: true },
      });
      if (refunded || made) throw new PublishingError("This request was already used. Start a new story.", 409, "story.requestUsed");
    } else {
      try {
        await spendCredits({ workspaceId: scope.workspaceId, amount: CREDIT_COSTS.storyWrite, reason: "story-write", refId, userId: scope.userId });
      } catch (e) {
        if (e instanceof InsufficientCreditsError) throw noCredits();
        throw e;
      }
    }
    const item = await tx.contentItem.create({
      data: {
        workspaceId: scope.workspaceId, brandId: scope.brandId, title: product.title, channel: "INSTAGRAM_STORY", status: "BRIEF_READY", productIds: [product.id], campaignId,
        brief: { goal: APP_GOALS[input.goal], products: [product.title], keyMessage: direction, angle: input.goal, requestId: input.requestId },
      },
    });
    await tx.auditEvent.create({
      data: { workspaceId: scope.workspaceId, brandId: scope.brandId, actorUserId: scope.userId, action: "content.create", entityType: "ContentItem", entityId: item.id, metadata: { channel: "INSTAGRAM_STORY", goal: input.goal, requestId: input.requestId } },
    });
    return { id: item.id, chargeId: refId, repeated: false };
  }, TX);
}

/** The Creator didn't start: give the 5 credits back and park the story as BLOCKED with a note the app shows. */
export async function failStoryStart(scope: BrandScope, itemId: string, chargeId: string) {
  await refundCharge(scope.workspaceId, chargeId);
  const item = await prisma.contentItem.findFirst({ where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId }, select: { brief: true } });
  const brief = (item?.brief && typeof item.brief === "object" && !Array.isArray(item.brief) ? item.brief : {}) as Record<string, unknown>;
  await prisma.contentItem.updateMany({
    where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId },
    data: { status: "BLOCKED", brief: { ...brief, note: STORY_START_NOTE } as Prisma.InputJsonValue },
  });
}

/**
 * "Fix it" on a story. A story with no version prepays the run with its latest charge when that still stands (so a final
 * failure refunds it), or charges again when it was refunded (refId `<itemId>:retry:<n>`, idempotent, so a double tap pays
 * once). A story with a version is free. Returns the charge id to prepay the run with, or null. A BLOCKED story goes
 * back to BRIEF_READY (its note cleared) so the writer picks it up.
 */
export async function reopenStoryWrite(scope: Scope, itemId: string): Promise<string | null> {
  const { item, latest } = await loadStory(prisma, scope, itemId);
  const requestId = (item.brief as { requestId?: unknown } | null)?.requestId;
  let chargeId: string | null = null;
  if (!latest && typeof requestId === "string") {
    const prefix = `${item.id}:retry:`;
    const retries = await prisma.creditEntry.count({ where: { workspaceId: scope.workspaceId, reason: "story-write", refId: { startsWith: prefix } } });
    const last = retries ? `${prefix}${retries}` : chargeRef(scope.brandId, requestId);
    const entry = (reason: string) => prisma.creditEntry.findFirst({ where: { workspaceId: scope.workspaceId, reason, refId: last }, select: { id: true } });
    if (await entry("refund")) {
      try {
        chargeId = await spendCredits({ workspaceId: scope.workspaceId, amount: CREDIT_COSTS.storyWrite, reason: "story-write", refId: `${prefix}${retries + 1}`, userId: scope.userId });
      } catch (e) {
        if (e instanceof InsufficientCreditsError) throw noCredits();
        throw e;
      }
    } else if (await entry("story-write")) chargeId = last;
  }
  if (item.status === "BLOCKED") {
    const { note: _note, ...brief } = (item.brief && typeof item.brief === "object" && !Array.isArray(item.brief) ? item.brief : {}) as Record<string, unknown>;
    await prisma.contentItem.updateMany({ where: { id: item.id, status: "BLOCKED" }, data: { status: "BRIEF_READY", brief: brief as Prisma.InputJsonValue } });
  }
  return chargeId;
}
