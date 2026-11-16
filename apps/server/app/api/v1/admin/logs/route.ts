import { period, type AdminLogsResponse, type LogKind } from "@espanda/shared";
import { adminOnly, queryOf, usdInr, wire } from "@/server/api/admin-route";
import { LOG_FILTERS, pageCount, parseCursor, peopleMatching, pickerOptions, platformLogs } from "@/server/services/platform-admin";

/**
 * Platform admin → one log, newest first. Takes the Logs page's query (log, status, days, before, ws, who, tests);
 * `workspaceId` scopes it to one workspace (and then ws, who and tests don't apply).
 */
export async function GET(request: Request) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const q = queryOf(request);
  const kind = (q.log && Object.hasOwn(LOG_FILTERS, q.log) ? q.log : "audit") as LogKind;
  const status = LOG_FILTERS[kind].some((f) => f.value === q.status) ? q.status! : null;
  const scoped = q.workspaceId || undefined;
  const tests = !scoped && kind === "calls" && q.tests === "1";
  const ws = scoped ? undefined : q.ws || undefined;
  const who = scoped ? undefined : q.who?.trim() || undefined;
  const [l, workspaces, rate] = await Promise.all([
    peopleMatching(who).then((actorIds) => platformLogs({ kind, workspaceId: scoped ?? ws, actorIds, status: status ?? undefined, includeTests: tests, days: period(q.days).days, before: parseCursor(q.before) })),
    scoped ? null : pickerOptions().then((o) => o.workspaces),
    usdInr(),
  ]);
  const body = wire({ kind, status, filters: LOG_FILTERS[kind], total: l.total, pages: pageCount(l.total), next: l.next ?? null, rows: l.rows, workspaces, usdInr: rate }) satisfies AdminLogsResponse;
  return Response.json(body);
}
