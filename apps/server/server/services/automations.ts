import { z } from "zod";
import { startAgentRun } from "@/server/agents/engine";
import { prisma } from "@/server/db/prisma";
import { CREDIT_COSTS, InsufficientCreditsError, refundCharge, spendCredits } from "@/server/services/credits";
import { publishRequirements, schedulePublication } from "@/server/services/publishing";
import { requirePlan } from "@/server/services/subscriptions";

/**
 * The owner's automations (mobile Business M10), on BrandProfile.automations:
 * - monthlyPlan: on the 1st of each month the daily sweep runs Generate calendar (Planner → Brief → Creator →
 *   Quality), charged like the app's button (5 credits); a month without enough credits is skipped.
 * - autoPublish: a post approved with a future date is scheduled straight away on the brand's connected account.
 * Review before publishing stays required: nothing here posts a draft nobody approved.
 */
export const Automations = z.object({ monthlyPlan: z.boolean().default(false), autoPublish: z.boolean().default(false) });
export type Automations = z.infer<typeof Automations>;
/** A change: only the switches sent (no defaults, so turning one on never turns the other off). */
export const AutomationsChange = z.object({ monthlyPlan: z.boolean().optional(), autoPublish: z.boolean().optional() }).strict();

type Scope = { workspaceId: string; brandId: string };

export async function readAutomations(scope: Scope): Promise<Automations> {
  const profile = await prisma.brandProfile.findFirst({ where: { brandId: scope.brandId, workspaceId: scope.workspaceId }, select: { automations: true } });
  return Automations.parse(profile?.automations ?? {});
}

/** Merges the change in one statement, so two switches flipped at once both stick. Null when there's no profile. */
export async function saveAutomations(scope: Scope, change: Partial<Automations>) {
  const rows = await prisma.$executeRaw`
    UPDATE "BrandProfile" SET "updatedAt" = now(), "automations" = COALESCE("automations", '{}'::jsonb) || ${JSON.stringify(change)}::jsonb
    WHERE "brandId" = ${scope.brandId} AND "workspaceId" = ${scope.workspaceId}`;
  return rows ? readAutomations(scope) : null;
}

/**
 * Daily sweep: on the 1st, Generate calendar for every brand that asked for it. The charge is keyed by brand and
 * month, so a retried sweep can't charge twice. ponytail: only the 1st; a sweep that misses that day skips the month.
 */
export async function runMonthlyPlans(now = new Date()) {
  if (now.getUTCDate() !== 1) return;
  const month = now.toISOString().slice(0, 7);
  const brands = await prisma.brandProfile.findMany({
    where: { automations: { path: ["monthlyPlan"], equals: true }, brand: { status: "ACTIVE" } },
    select: { workspaceId: true, brandId: true },
  });
  const planned = new Map<string, boolean>();
  const monthStart = new Date(`${month}-01T00:00:00Z`);
  for (const b of brands) {
    // Once a month: a retried sweep finds this month's run and leaves it (the charge's refId alone can't tell,
    // since a refunded charge is found again without charging).
    // Generating the calendar needs a plan: a workspace without one skips the month.
    if (!planned.has(b.workspaceId)) planned.set(b.workspaceId, await requirePlan(b.workspaceId).then(() => true, () => false));
    if (!planned.get(b.workspaceId)) continue;
    const already = await prisma.agentRun.count({ where: { brandId: b.brandId, agentKey: "planner", trigger: "schedule", createdAt: { gte: monthStart } } });
    if (already) continue;
    let chargeId: string | undefined;
    try {
      chargeId = await spendCredits({ workspaceId: b.workspaceId, amount: CREDIT_COSTS.manualRun, reason: "agent-run:planner", refId: `monthly-plan:${b.brandId}:${month}` });
      const run = await startAgentRun({ workspaceId: b.workspaceId, brandId: b.brandId, agentKey: "planner", trigger: "schedule", input: { chain: true }, prepaidChargeId: chargeId });
      // Folded into a Planner run already going: that one is paid for, so this charge goes back.
      if ((run.input as { chargeId?: string } | null)?.chargeId !== chargeId) await refundCharge(b.workspaceId, chargeId);
    } catch (e) {
      if (chargeId && !(e instanceof InsufficientCreditsError)) await refundCharge(b.workspaceId, chargeId).catch(() => null);
      // Not enough credits, or the Planner is off for this brand: this month is skipped.
    }
  }
}

/**
 * After an approval: with auto-publish on, schedule the post for its planned date on the brand's first connected
 * account for that channel, with the approved draft's photos. Never throws: anything missing (no account, the date
 * has passed, a Pinterest board to choose) leaves the post approved for the person to schedule.
 */
export async function autoPublish(scope: Scope & { userId: string }, itemId: string) {
  try {
    if (!(await readAutomations(scope)).autoPublish) return;
    const item = await prisma.contentItem.findFirst({
      where: { id: itemId, workspaceId: scope.workspaceId, brandId: scope.brandId, status: "APPROVED" },
      select: { channel: true, scheduledFor: true, versions: { orderBy: { version: "desc" }, take: 1, select: { version: true, body: true } } },
    });
    const latest = item?.versions[0];
    if (!item || !latest || !item.scheduledFor || item.scheduledFor.getTime() < Date.now() + 5 * 60_000) return;
    if (item.channel === "INSTAGRAM_STORY") return; // stories are packaged and posted by a person
    const req = publishRequirements(item.channel);
    if (!req.provider || req.needsBoard) return;
    const account = await prisma.integrationConnection.findFirst({ where: { brandId: scope.brandId, provider: req.provider, status: "ACTIVE" }, orderBy: { createdAt: "asc" }, select: { id: true } });
    if (!account) return;
    const photoKeys = (latest.body as { photoKeys?: string[] }).photoKeys;
    await schedulePublication({ ...scope, itemId, version: latest.version, connectionId: account.id, mediaKeys: photoKeys?.length ? photoKeys : undefined, runAt: item.scheduledFor });
  } catch {
    // The person can still schedule it by hand.
  }
}
