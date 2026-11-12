import { randomUUID } from "node:crypto";
import { Prisma, type ReelAsset } from "@prisma/client";
import { prisma } from "@/server/db/prisma";
import { enqueueJob } from "@/server/jobs/queue";
import { refused } from "@/server/photoshoot/shoot";
import { higgsfield } from "@/server/reels/higgsfield";
import { refundCharge, spendCredits } from "@/server/services/credits";
import { PublishingError } from "@/server/services/publishing";
import { requirePlan } from "@/server/services/subscriptions";

/**
 * Paid Higgsfield assets for reels (ReelAsset rows): a brand's template previews (templates.ts) and presenters
 * (presenters.ts). One job for every kind, copying the photoshoot shape: charge (refId = row id) → submit
 * (Idempotency-Key = row id) → poll → store in our media → DONE, or FAILED and refunded. A retry is a new row.
 * Each kind registers how it submits and what it stores; the photoshoot code is untouched.
 */
export const REEL_ASSET_JOB = "reels.asset";
const POLL_MS = 15_000;
const GIVE_UP_MS = 60 * 60_000;
type Scope = { workspaceId: string; brandId: string };

/** submit: sends the request (keeping on the row anything a resend must repeat); store: saves the result, returns its key. */
type AssetKind = { submit: (asset: ReelAsset) => Promise<string>; store: (asset: ReelAsset, url: string) => Promise<string> };
const KINDS = new Map<string, AssetKind>();
export const registerAssetKind = (kind: string, handler: AssetKind) => void KINDS.set(kind, handler);

export const assetsOf = (scope: Scope, kind: string) =>
  prisma.reelAsset.findMany({ where: { workspaceId: scope.workspaceId, brandId: scope.brandId, kind }, orderBy: { createdAt: "desc" }, take: 100 });

/**
 * Charges, records the request and queues the job. The partial unique index allows one RUNNING row per brand, kind
 * and template, so a second tap while one is being made is refused (refunded) with `busy`.
 */
export async function createAsset(scope: Scope & { userId: string }, a: { kind: string; input: Prisma.InputJsonObject; credits: number; reason: string; busy: string }) {
  await requirePlan(scope.workspaceId);
  // A row whose job died without failing it would hold the one-running index for good: give up on it (refunded).
  const stale = await prisma.reelAsset.findMany({ where: { workspaceId: scope.workspaceId, brandId: scope.brandId, kind: a.kind, status: "RUNNING", createdAt: { lt: new Date(Date.now() - GIVE_UP_MS) } } });
  for (const s of stale) await failAsset(s.id, "It took more than an hour");
  const id = randomUUID();
  const chargeId = await spendCredits({ workspaceId: scope.workspaceId, amount: a.credits, reason: a.reason, refId: id, userId: scope.userId });
  const asset = await prisma.reelAsset
    .create({ data: { id, workspaceId: scope.workspaceId, brandId: scope.brandId, kind: a.kind, input: a.input, chargeId, createdByUserId: scope.userId } })
    .catch(async (e: unknown) => {
      await refundCharge(scope.workspaceId, chargeId);
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") throw new PublishingError(a.busy, 409);
      throw e;
    });
  await enqueueJob({ type: REEL_ASSET_JOB, workspaceId: asset.workspaceId, brandId: asset.brandId, payload: { assetId: asset.id }, maxAttempts: 3, idempotencyKey: `asset:${asset.id}:start` }).catch(async (e: unknown) => {
    await failAsset(asset.id, e instanceof Error ? e.message : String(e));
    throw e;
  });
  return asset;
}

async function enqueuePoll(a: Pick<ReelAsset, "id" | "workspaceId" | "brandId">) {
  const runAt = new Date(Math.ceil((Date.now() + POLL_MS) / POLL_MS) * POLL_MS);
  await enqueueJob({ type: REEL_ASSET_JOB, workspaceId: a.workspaceId, brandId: a.brandId, payload: { assetId: a.id }, runAt, maxAttempts: 3, idempotencyKey: `asset:${a.id}:at:${runAt.getTime() / POLL_MS}` });
}

/** Job handler: submits once, then polls until the result is stored or failed. */
export async function runAsset(payload: unknown) {
  const { assetId } = payload as { assetId: string };
  const asset = await prisma.reelAsset.findUnique({ where: { id: assetId } });
  if (!asset || asset.status !== "RUNNING") return;
  const kind = KINDS.get(asset.kind);
  if (!kind) return failAsset(asset.id, `Unknown asset kind ${asset.kind}`);

  if (!asset.requestId) {
    try {
      const requestId = await kind.submit(asset);
      await prisma.reelAsset.update({ where: { id: asset.id }, data: { requestId } });
    } catch (e) {
      if (refused(e)) return failAsset(asset.id, (e as Error).message);
      throw e;
    }
    return enqueuePoll(asset);
  }
  const status = await higgsfield.status(asset.requestId).catch(() => null); // a failed read is a hiccup, not a failure
  if (status?.state === "failed") return failAsset(asset.id, status.error ?? "It failed");
  if (status?.state === "completed") {
    const outputKey = await kind.store(asset, status.url!);
    await prisma.reelAsset.updateMany({ where: { id: asset.id, status: "RUNNING" }, data: { status: "DONE", outputKey } });
    return;
  }
  if (Date.now() - asset.createdAt.getTime() > GIVE_UP_MS) return failAsset(asset.id, "It took more than an hour");
  return enqueuePoll(asset);
}

export async function onAssetFailure(payload: unknown, error: unknown, exhausted: boolean) {
  if (!exhausted) return;
  await failAsset((payload as { assetId: string }).assetId, error instanceof Error ? error.message : String(error));
}

/** One transaction: an asset is never FAILED without its refund. */
export async function failAsset(id: string, error: string) {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.reelAsset.updateMany({ where: { id, status: "RUNNING" }, data: { status: "FAILED", error: error.slice(0, 500) } });
    if (!count) return;
    const asset = await tx.reelAsset.findUniqueOrThrow({ where: { id } });
    await refundCharge(asset.workspaceId, asset.chargeId, tx);
  });
}
