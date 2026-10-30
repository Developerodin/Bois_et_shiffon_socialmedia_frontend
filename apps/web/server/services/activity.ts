import { prisma } from "@/server/db/prisma";
import { PAGE } from "@/server/services/platform-admin";

// ── Recording page visits ───────────────────────────────────────────────────

/** Not recorded: the admin console (its visits are audited instead), the API, and invitation links (live token in the path). */
const UNRECORDED = ["/admin", "/api", "/invite"];

/**
 * The path worth keeping, or null. The query and fragment are dropped: search boxes put what people typed into `?q=`,
 * and that isn't ours to keep.
 */
export function cleanPagePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const path = raw.split(/[?#]/)[0];
  if (!path.startsWith("/") || path.startsWith("//") || path.length > 300) return null;
  if (UNRECORDED.some((p) => path === p || path.startsWith(`${p}/`))) return null;
  return path;
}

/**
 * Write one visit. The workspace and project are kept only if the person is a member and the project is in that
 * workspace, so a client never files a row somewhere it doesn't belong. With no workspace sent (the mobile app), the
 * visit goes under the person's only workspace, or none if they have several.
 */
export async function recordPageView({ userId, platform, path, workspaceId, brandId }: { userId: string; platform: "web" | "mobile"; path: string; workspaceId?: string; brandId?: string }) {
  let ws: string | null = null;
  if (workspaceId) {
    const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { id: true } });
    ws = member ? workspaceId : null;
  } else {
    const mine = await prisma.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true }, take: 2 });
    ws = mine.length === 1 ? mine[0].workspaceId : null;
  }
  const brand = ws && brandId ? await prisma.brand.findFirst({ where: { id: brandId, workspaceId: ws }, select: { id: true } }) : null;
  await prisma.pageView.create({ data: { userId, platform, path, workspaceId: ws, brandId: brand ? brandId! : null } });
}

// ── Activity list: one row per person per workspace ─────────────────────────

type Counted = { userId: string; workspaceId: string | null; n?: number; usd?: number; last: Date };
export type ActivityCount = { userId: string; workspaceId: string | null; last: Date; visits: number; actions: number; tasks: number; usd: number };

/** Add up the per-source counts for each (person, workspace), most recently active first. */
export function mergeActivityCounts(sources: { visits: Counted[]; actions: Counted[]; tasks: Counted[]; ai: Counted[]; api: Counted[] }): ActivityCount[] {
  const rows = new Map<string, ActivityCount>();
  for (const [field, list] of Object.entries(sources) as [keyof typeof sources, Counted[]][]) {
    for (const c of list) {
      const key = `${c.workspaceId ?? ""}|${c.userId}`;
      const row = rows.get(key) ?? { userId: c.userId, workspaceId: c.workspaceId, last: c.last, visits: 0, actions: 0, tasks: 0, usd: 0 };
      if (field === "ai" || field === "api") row.usd += c.usd ?? 0;
      else row[field] += c.n ?? 0;
      if (c.last > row.last) row.last = c.last;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => +b.last - +a.last);
}

/**
 * Everyone's activity, per workspace: five all-time GROUP BYs merged in memory, then one page.
 * ponytail: fine into the low millions of page-visit rows. Past that, roll daily counts into a summary table, or add
 * retention.
 */
export async function activityList({ workspaceId, userId, page = 1 }: { workspaceId?: string; userId?: string; page?: number }) {
  const ws = workspaceId ? { workspaceId } : {};
  const last = (g: { _max: { createdAt: Date | null } }) => g._max.createdAt!;
  const [visits, actions, tasks, ai, api] = await Promise.all([
    prisma.pageView.groupBy({ by: ["workspaceId", "userId"], where: { ...ws, ...(userId ? { userId } : {}) }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.auditEvent.groupBy({ by: ["workspaceId", "actorUserId"], where: { ...ws, actorUserId: userId ?? { not: null } }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.agentRun.groupBy({ by: ["workspaceId", "triggeredByUserId"], where: { ...ws, triggeredByUserId: userId ?? { not: null } }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.aiWorkflowRun.groupBy({ by: ["workspaceId", "userId"], where: { ...ws, userId: userId ?? { not: null } }, _sum: { costUsd: true }, _max: { createdAt: true } }),
    prisma.apiCall.groupBy({ by: ["workspaceId", "userId"], where: { ...ws, userId: userId ?? { not: null } }, _sum: { costUsd: true }, _max: { createdAt: true } }),
  ]);
  const all = mergeActivityCounts({
    visits: visits.map((g) => ({ userId: g.userId, workspaceId: g.workspaceId, n: g._count._all, last: last(g) })),
    actions: actions.map((g) => ({ userId: g.actorUserId!, workspaceId: g.workspaceId, n: g._count._all, last: last(g) })),
    tasks: tasks.map((g) => ({ userId: g.triggeredByUserId!, workspaceId: g.workspaceId, n: g._count._all, last: last(g) })),
    ai: ai.map((g) => ({ userId: g.userId!, workspaceId: g.workspaceId, usd: Number(g._sum.costUsd ?? 0), last: last(g) })),
    api: api.map((g) => ({ userId: g.userId!, workspaceId: g.workspaceId, usd: Number(g._sum.costUsd ?? 0), last: last(g) })),
  });
  const rows = all.slice((page - 1) * PAGE, page * PAGE);
  const names = await namesFor(rows);
  return { hasMore: all.length > page * PAGE, rows: rows.map((r) => ({ ...r, ...names(r) })) };
}

/** Display names for the people, workspaces and projects on a page of rows. */
async function namesFor(rows: { userId?: string; workspaceId: string | null; brandId?: string | null }[]) {
  const ids = <K extends "userId" | "workspaceId" | "brandId">(k: K) => [...new Set(rows.map((r) => r[k]).filter((x): x is string => !!x))];
  const [people, workspaces, brands] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids("userId") } }, select: { id: true, name: true, email: true } }),
    prisma.workspace.findMany({ where: { id: { in: ids("workspaceId") } }, select: { id: true, name: true } }),
    prisma.brand.findMany({ where: { id: { in: ids("brandId") } }, select: { id: true, displayName: true } }),
  ]);
  const person = new Map(people.map((p) => [p.id, p.name ?? p.email]));
  const workspace = new Map(workspaces.map((w) => [w.id, w.name]));
  const brand = new Map(brands.map((b) => [b.id, b.displayName]));
  return (r: { userId?: string; workspaceId: string | null; brandId?: string | null }) => ({
    who: r.userId ? (person.get(r.userId) ?? "(deleted user)") : "",
    workspace: r.workspaceId ? (workspace.get(r.workspaceId) ?? "(deleted workspace)") : null,
    brand: r.brandId ? (brand.get(r.brandId) ?? "(deleted project)") : null,
  });
}
