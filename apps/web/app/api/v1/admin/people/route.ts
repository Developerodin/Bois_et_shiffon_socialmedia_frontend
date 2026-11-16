import type { AdminPeople } from "@espanda/shared";
import { adminOnly, nextPage, queryOf, wire } from "@/server/api/admin-route";
import { listPeople, pageCount, pageNumber } from "@/server/services/platform-admin";

/** Platform admin → accounts, newest first. Takes the People page's query (q, page). */
export async function GET(request: Request) {
  const admin = await adminOnly(request);
  if (admin instanceof Response) return admin;
  const q = queryOf(request);
  const page = pageNumber(q.page);
  const p = await listPeople({ q: q.q, page });
  const body = wire({
    page,
    total: p.total,
    pages: pageCount(p.total),
    next: nextPage(p.hasMore, page),
    rows: p.rows.map(({ id, email, name, status, isPlatformAdmin, createdAt, workspaces, projectRoles, lastSignIn }) => ({ id, email, name, status, isPlatformAdmin, createdAt, workspaces, projectRoles, lastSignIn })),
  }) satisfies AdminPeople;
  return Response.json(body);
}
