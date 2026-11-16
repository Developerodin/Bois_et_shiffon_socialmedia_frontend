/**
 * Turn a workspace's plan on (granting this period's credits) or off, until store purchases exist.
 *   npm run set-plan -w web -- <workspaceId> professional|starter
 *   npm run set-plan -w web -- <workspaceId> none
 */
import { prisma } from "@/server/db/prisma";
import { isPlanId, setPlan } from "@/server/services/subscriptions";

async function main() {
  const [workspaceId, plan] = process.argv.slice(2);
  if (!workspaceId || !plan || (plan !== "none" && !isPlanId(plan))) {
    console.error("Usage: npm run set-plan -w web -- <workspaceId> professional|starter|none");
    process.exit(1);
  }
  // Which database this will change (the .env it runs with), before it does.
  console.log(`Database: ${new URL(process.env.DATABASE_URL ?? "postgres://unknown").host}`);
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { name: true } });
  if (!ws) throw new Error(`No workspace ${workspaceId}`);
  const sub = await setPlan(workspaceId, plan === "none" ? null : plan);
  console.log(sub ? `${ws.name}: ${plan} until ${sub.periodEnd.toISOString().slice(0, 10)}` : `${ws.name}: no plan`);
}

main().finally(() => prisma.$disconnect());
