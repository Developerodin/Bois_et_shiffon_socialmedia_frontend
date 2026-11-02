import { prisma } from "@/server/db/prisma";
import { hasUnlimitedCredits } from "@/server/services/credits";

/**
 * Plans (mobile "06 No subscription"): a workspace's plan unlocks making videos (reel renders) and generating the
 * posts calendar, and adds its credits every month. No payments yet: a platform admin activates a plan
 * (`npm run set-plan -w web`); store purchases plug in here later. Workspaces with unlimited credits count as planned.
 * ponytail: prices aren't set, so the app shows "Pricing is not available yet" instead of a purchase button.
 */
export const PLANS = {
  starter: { credits: 60 },
  professional: { credits: 200 },
} as const;
export type PlanId = keyof typeof PLANS;
export const isPlanId = (v: string): v is PlanId => v in PLANS;

const PERIOD_DAYS = 30;
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

export class PlanRequiredError extends Error {
  constructor() {
    super("This needs a plan. Choose one to make videos and plan your calendar.");
  }
}

/** The workspace's live plan, or null. */
export async function activePlan(workspaceId: string) {
  const sub = await prisma.subscription.findUnique({ where: { workspaceId } });
  return sub && sub.status === "ACTIVE" ? { id: sub.planId as PlanId, credits: PLANS[sub.planId as PlanId]?.credits ?? 0, renewsAt: sub.periodEnd } : null;
}

/** Rendering and calendar generation call this first. */
export async function requirePlan(workspaceId: string) {
  if (hasUnlimitedCredits(workspaceId)) return;
  if (!(await activePlan(workspaceId))) throw new PlanRequiredError();
}

/**
 * A period's credits, once: keyed by subscription, plan and period start, so a retry can't add them twice while an
 * upgrade on the same day still gets its own grant. ponytail: an upgrade grants the new plan's full credits.
 */
async function grantPeriod(workspaceId: string, subscriptionId: string, planId: PlanId, periodStart: Date) {
  await prisma.creditEntry
    .create({ data: { workspaceId, delta: PLANS[planId].credits, reason: "plan-credits", refId: `${subscriptionId}:${planId}:${periodStart.toISOString().slice(0, 10)}` } })
    .catch((e: { code?: string }) => {
      if (e.code !== "P2002") throw e; // already granted
    });
}

/**
 * A platform admin turns a plan on (with this period's credits) or off (null). Setting the plan a workspace already
 * has changes nothing (no second grant inside a paid period). Every change is in the audit log.
 */
export async function setPlan(workspaceId: string, planId: PlanId | null) {
  const current = await prisma.subscription.findUnique({ where: { workspaceId } });
  const audit = (metadata: object) =>
    prisma.auditEvent.create({ data: { workspaceId, action: "plan.set", entityType: "Subscription", entityId: workspaceId, metadata: { from: current?.status === "ACTIVE" ? current.planId : null, ...metadata } } });
  if (!planId) {
    await prisma.subscription.updateMany({ where: { workspaceId }, data: { status: "CANCELED" } });
    await audit({ to: null });
    return null;
  }
  if (current?.status === "ACTIVE" && current.planId === planId) return current;
  const now = new Date();
  const sub = await prisma.subscription.upsert({
    where: { workspaceId },
    update: { planId, status: "ACTIVE", periodStart: now, periodEnd: addDays(now, PERIOD_DAYS) },
    create: { workspaceId, planId, status: "ACTIVE", periodStart: now, periodEnd: addDays(now, PERIOD_DAYS) },
  });
  await grantPeriod(workspaceId, sub.id, planId, sub.periodStart);
  await audit({ to: planId });
  return sub;
}

/** Daily sweep: plans whose period ended start the next one, with its credits. */
export async function renewDuePlans(now = new Date()) {
  const due = await prisma.subscription.findMany({ where: { status: "ACTIVE", periodEnd: { lte: now } } });
  for (const sub of due) {
    if (!isPlanId(sub.planId)) continue;
    try {
      // Catch up period by period if the sweep missed some days (each start is keyed, so nothing doubles).
      let start = sub.periodEnd;
      while (start <= now) {
        await grantPeriod(sub.workspaceId, sub.id, sub.planId, start);
        start = addDays(start, PERIOD_DAYS);
      }
      await prisma.subscription.update({ where: { id: sub.id }, data: { periodStart: addDays(start, -PERIOD_DAYS), periodEnd: start } });
    } catch (e) {
      // One workspace's failure mustn't stop the others (or the rest of the daily sweep); tomorrow retries it.
      console.error(`Plan renewal failed for ${sub.workspaceId}`, e);
    }
  }
}
