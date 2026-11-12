import { prisma } from "@/server/db/prisma";
import type { ReelPlan } from "@/server/reels/plan";
import { donePresenter } from "@/server/reels/presenters";

type Db = Pick<typeof prisma, "reelAsset">;

/**
 * What a plan names that this brand doesn't own (or no longer has), in words a person can act on. Empty = fine.
 * Checked when a plan is saved (edit, chat) and again before a render is charged; never in the scriptwriter's
 * validate (it can't change these). planProblems holds the rules that need no database.
 */
export async function planOwnershipProblems(plan: ReelPlan, scope: { workspaceId: string; brandId: string }, db: Db = prisma): Promise<string[]> {
  const out: string[] = [];
  if (plan.presenter !== "none" && !(await donePresenter(scope, plan.presenter, db))) out.push("Presenter removed: pick another.");
  return out;
}
