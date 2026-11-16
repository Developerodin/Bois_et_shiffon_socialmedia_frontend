import { period, type AdminSpend } from "@espanda/shared";
import { adminOnly, queryOf, usdInr, wire } from "@/server/api/admin-route";
import { spendBreakdown } from "@/server/services/platform-admin";

/** Platform admin → spend and usage over a period (days), for the platform or one workspace (`workspaceId`); `tests=1` adds the test runs. */
export async function GET(request: Request) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const q = queryOf(request);
  const workspaceId = q.workspaceId || undefined;
  const [s, rate] = await Promise.all([spendBreakdown({ days: period(q.days).days, workspaceId, includeTests: !workspaceId && q.tests === "1" }), usdInr()]);
  return Response.json(wire({ ...s, usdInr: rate }) satisfies AdminSpend);
}
