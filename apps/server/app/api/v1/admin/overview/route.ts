import type { AdminOverview } from "@espanda/shared";
import { adminOnly, usdInr, wire } from "@/server/api/admin-route";
import { platformOverview } from "@/server/services/platform-admin";

const usd30 = (s: { aiUsd30: number; apiUsd30: number }) => s.aiUsd30 + s.apiUsd30;

/** Platform admin → the console's front page: platform totals and the five costliest workspaces (last 30 days). */
export async function GET(request: Request) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const [o, rate] = await Promise.all([platformOverview(), usdInr()]);
  const top = [...o.workspaces].sort((a, b) => usd30(b.spend) - usd30(a.spend)).slice(0, 5);
  const body = wire({
    users: o.users,
    unpriced: o.unpriced,
    workspaceCount: o.workspaces.length,
    customers: o.customers,
    tests: o.tests,
    top: top.map(({ id, name, spend, lastActive }) => ({ id, name, spend, lastActive })),
    usdInr: rate,
  }) satisfies AdminOverview;
  return Response.json(body);
}
