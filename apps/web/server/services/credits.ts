import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";

/**
 * Workspace credits: an append-only ledger (grants +, spends −, refunds +). Balance = sum.
 * A starter grant per workspace, then a plan's monthly credits as "plan-credits" rows (server/services/subscriptions.ts).
 * ponytail: purchases and top-ups will be more rows of the same kind.
 */
export const CREDIT_COSTS = { siteAudit: 10, manualRun: 5, reelPerSecond: 2, presenterPerSecond: 4, storyWrite: 5 } as const;
export const STARTER_CREDITS = 20;
/** The quality check is the required gate before approval: never charge for it on top of the draft it checks. */
export const FREE_MANUAL_AGENTS: ReadonlySet<string> = new Set(["quality"]);

/**
 * Testing override via env (comma-separated workspace ids): never charged, and counted as having a plan
 * (subscriptions.ts requirePlan). ponytail: a flag on Workspace if testing workspaces need managing from the app.
 */
export const hasUnlimitedCredits = (workspaceId: string) =>
  (process.env.UNLIMITED_CREDIT_WORKSPACES ?? "").split(",").map((s) => s.trim()).includes(workspaceId);
export const AUDIT_FRESH_DAYS = 30;

export class InsufficientCreditsError extends Error {
  constructor(readonly balance: number, readonly needed: number) {
    super(`Not enough credits: ${balance} left, ${needed} needed`);
  }
}

async function ensureStarterGrant(workspaceId: string) {
  await prisma.creditEntry.createMany({
    data: [{ workspaceId, delta: STARTER_CREDITS, reason: "initial-grant", refId: "initial" }],
    skipDuplicates: true, // unique (workspaceId, reason, refId): granted once
  });
}

export async function creditBalance(workspaceId: string) {
  await ensureStarterGrant(workspaceId);
  const { _sum } = await prisma.creditEntry.aggregate({ where: { workspaceId }, _sum: { delta: true } });
  return _sum.delta ?? 0;
}

/**
 * Spend credits atomically. A transaction-scoped advisory lock per workspace serialises spends,
 * so two clicks at once can't both pass the balance check. Returns the charge id to refund later.
 * With `refId` the spend is idempotent: a second call for the same (reason, refId) returns it without charging again.
 */
export async function spendCredits(input: { workspaceId: string; amount: number; reason: string; userId?: string; refId?: string }) {
  await ensureStarterGrant(input.workspaceId);
  const chargeId = input.refId ?? randomUUID();
  const charged = (db: Pick<typeof prisma, "creditEntry">) =>
    input.refId ? db.creditEntry.findFirst({ where: { workspaceId: input.workspaceId, reason: input.reason, refId: input.refId } }) : null;
  // Two calls with the same refId at once: the unique (workspaceId, reason, refId) lets one through.
  const duplicate = (e: unknown) => {
    if (input.refId && (e as { code?: string }).code === "P2002") return;
    throw e;
  };
  if (await charged(prisma)) return chargeId;
  if (hasUnlimitedCredits(input.workspaceId)) {
    // Zero-delta row keeps the usage trail; refundCharge finds no negative row, so nothing to give back.
    await prisma.creditEntry.create({ data: { workspaceId: input.workspaceId, delta: 0, reason: input.reason, refId: chargeId, userId: input.userId } }).catch(duplicate);
    return chargeId;
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credits:${input.workspaceId}`}))`;
    // A double tap that waited on the lock: the first tap's charge is there now; don't judge the balance again.
    if (await charged(tx)) return;
    const { _sum } = await tx.creditEntry.aggregate({ where: { workspaceId: input.workspaceId }, _sum: { delta: true } });
    const balance = _sum.delta ?? 0;
    if (balance < input.amount) throw new InsufficientCreditsError(balance, input.amount);
    await tx.creditEntry.create({
      data: { workspaceId: input.workspaceId, delta: -input.amount, reason: input.reason, refId: chargeId, userId: input.userId },
    });
  }).catch(duplicate);
  return chargeId;
}

/** Give a charge back (failed run). Idempotent: one refund per charge. */
export async function refundCharge(workspaceId: string, chargeId: string, db: Pick<typeof prisma, "creditEntry"> = prisma) {
  const charge = await db.creditEntry.findFirst({ where: { workspaceId, refId: chargeId, delta: { lt: 0 } } });
  if (!charge) return false;
  const res = await db.creditEntry.createMany({
    data: [{ workspaceId, delta: -charge.delta, reason: "refund", refId: chargeId }],
    skipDuplicates: true,
  });
  return res.count === 1;
}
