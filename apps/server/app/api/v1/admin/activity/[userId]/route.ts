import { NO_WORKSPACE, period, type AdminPersonTimeline } from "@espanda/shared";
import { adminOnly, notFoundResponse, queryOf, usdInr, wire } from "@/server/api/admin-route";
import { personSummary, personTimeline } from "@/server/services/activity";
import { pageCount, parseCursor, pickerOptions } from "@/server/services/platform-admin";

/** Platform admin → one person's timeline and what they've cost. Takes ws (a workspace id or "none"), days and before. */
export async function GET(request: Request, context: { params: Promise<{ userId: string }> }) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const { userId } = await context.params;
  const q = queryOf(request);
  const ws = q.ws || undefined;
  const workspaceId = ws === NO_WORKSPACE ? null : ws; // null: only what happened outside any workspace
  const days = period(q.days).days;
  const [s, t, options, rate] = await Promise.all([personSummary({ userId, workspaceId, days }), personTimeline({ userId, workspaceId, days, before: parseCursor(q.before) }), pickerOptions(), usdInr()]);
  if (!s.user && !t.total) return notFoundResponse(); // a deleted account still shows what it left behind
  const body = wire({ user: s.user, aiUsd: s.aiUsd, apiUsd: s.apiUsd, total: t.total, pages: pageCount(t.total), next: t.next ?? null, items: t.items, workspaces: options.workspaces, usdInr: rate }) satisfies AdminPersonTimeline;
  return Response.json(body);
}
