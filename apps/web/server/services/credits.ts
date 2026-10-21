import { randomUUID } from "node:crypto";
import { prisma } from "@/server/db/prisma";

/**
 * Workspace credits: an append-only ledger (grants +, spends −, refunds +). Balance = sum.
 * ponytail: one starter grant per workspace; plans, monthly allowances and Stripe top-ups come later
 * as more "grant"/"top-up" rows, no schema change needed.
 */
export const CREDIT_COSTS = { siteAudit: 10 } as const;
export const STARTER_CREDITS = 100;
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
 */
export async function spendCredits(input: { workspaceId: string; amount: number; reason: string; userId: string }) {
  await ensureStarterGrant(input.workspaceId);
  const chargeId = randomUUID();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`credits:${input.workspaceId}`}))`;
    const { _sum } = await tx.creditEntry.aggregate({ where: { workspaceId: input.workspaceId }, _sum: { delta: true } });
    const balance = _sum.delta ?? 0;
    if (balance < input.amount) throw new InsufficientCreditsError(balance, input.amount);
    await tx.creditEntry.create({
      data: { workspaceId: input.workspaceId, delta: -input.amount, reason: input.reason, refId: chargeId, userId: input.userId },
    });
  });
  return chargeId;
}

/** Give a charge back (failed run). Idempotent: one refund per charge. */
export async function refundCharge(workspaceId: string, chargeId: string) {
  const charge = await prisma.creditEntry.findFirst({ where: { workspaceId, refId: chargeId, delta: { lt: 0 } } });
  if (!charge) return false;
  const res = await prisma.creditEntry.createMany({
    data: [{ workspaceId, delta: -charge.delta, reason: "refund", refId: chargeId }],
    skipDuplicates: true,
  });
  return res.count === 1;
}
