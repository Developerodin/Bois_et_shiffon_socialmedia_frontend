import { ACTIVITY_SORTS, period, type ActivitySort, type AdminActivityList } from "@espanda/shared";
import { adminOnly, nextPage, queryOf, usdInr, wire } from "@/server/api/admin-route";
import { activityList } from "@/server/services/activity";
import { pageCount, pageNumber, peopleMatching, pickerOptions } from "@/server/services/platform-admin";

/** Platform admin → what each person does in each workspace. Takes the Activity page's query (ws, who, days, sort, page). */
export async function GET(request: Request) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const q = queryOf(request);
  const sort = (ACTIVITY_SORTS as readonly (string | undefined)[]).includes(q.sort) ? (q.sort as ActivitySort) : "active";
  const page = pageNumber(q.page);
  const who = q.who?.trim() || undefined;
  const [a, options, rate] = await Promise.all([
    peopleMatching(who).then((userIds) => activityList({ workspaceId: q.ws || undefined, userIds, days: period(q.days).days, sort, page })),
    pickerOptions(),
    usdInr(),
  ]);
  const body = wire({ page, total: a.total, pages: pageCount(a.total), next: nextPage(a.hasMore, page), rows: a.rows, workspaces: options.workspaces, usdInr: rate }) satisfies AdminActivityList;
  return Response.json(body);
}
