import { WORKSPACE_SORTS, type AdminWorkspaces, type WorkspaceSort } from "@espanda/shared";
import { adminOnly, nextPage, queryOf, usdInr, wire } from "@/server/api/admin-route";
import { listWorkspaces, pageCount, pageNumber } from "@/server/services/platform-admin";

/** Platform admin → workspaces with their size, credits and 30-day spend. Takes the Workspaces page's query (q, sort, page). */
export async function GET(request: Request) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const q = queryOf(request);
  const sort = (WORKSPACE_SORTS as readonly (string | undefined)[]).includes(q.sort) ? (q.sort as WorkspaceSort) : "newest";
  const page = pageNumber(q.page);
  const [w, rate] = await Promise.all([listWorkspaces({ q: q.q, sort, page }), usdInr()]);
  const body = wire({
    page,
    total: w.total,
    pages: pageCount(w.total),
    next: nextPage(w.hasMore, page),
    customers30: w.customers30,
    rows: w.rows.map(({ id, name, slug, createdAt, owner, _count, spend, lastActive, credits }) => ({ id, name, slug, createdAt, owner, _count: { members: _count.members, brands: _count.brands }, spend, lastActive, credits })),
    usdInr: rate,
  }) satisfies AdminWorkspaces;
  return Response.json(body);
}
