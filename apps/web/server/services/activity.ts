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

// ── One person's timeline ───────────────────────────────────────────────────

export type TimelineItem = {
  kind: "visit" | "action" | "task" | "ai";
  id: string;
  at: Date;
  workspaceId: string | null;
  brandId: string | null;
  /** The path, the audit action, the agent, or the AI task */
  detail?: string;
  platform?: string;
  entityType?: string;
  status?: string;
  model?: string;
  usd?: number;
};
const KIND_ORDER = ["visit", "action", "task", "ai"];

/**
 * One page of several newest-first lists, merged newest first. Ties keep each list's own order (the database's), then
 * go by kind, so the same rows land on the same page whichever page is asked for.
 */
export function mergeTimeline(lists: TimelineItem[][], page: number) {
  const all = lists
    .flatMap((list) => list.map((item, i) => ({ item, i })))
    .sort((a, b) => +b.item.at - +a.item.at || KIND_ORDER.indexOf(a.item.kind) - KIND_ORDER.indexOf(b.item.kind) || a.i - b.i)
    .map((x) => x.item);
  return { items: all.slice((page - 1) * PAGE, page * PAGE), hasMore: all.length > page * PAGE };
}

/**
 * Page visits, actions, agent tasks (cost = their AI calls) and AI calls outside agent runs (in practice chat turns:
 * task, model and cost, never text), newest first. An agent's own AI calls are folded into its task row.
 * ponytail: page n reads the newest n×50+1 rows of each source, so deep pages read more. If people page past ~20,
 * switch to a (createdAt, id) cursor.
 */
export async function personTimeline({ userId, workspaceId, page = 1 }: { userId: string; workspaceId?: string; page?: number }) {
  const ws = workspaceId ? { workspaceId } : {};
  const take = page * PAGE + 1;
  const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  const [visits, actions, tasks, calls] = await Promise.all([
    prisma.pageView.findMany({ where: { userId, ...ws }, orderBy, take }),
    prisma.auditEvent.findMany({ where: { actorUserId: userId, ...ws }, orderBy, take, select: { id: true, workspaceId: true, brandId: true, action: true, entityType: true, createdAt: true } }),
    prisma.agentRun.findMany({ where: { triggeredByUserId: userId, ...ws }, orderBy, take, select: { id: true, workspaceId: true, brandId: true, agentKey: true, status: true, createdAt: true } }),
    prisma.aiWorkflowRun.findMany({ where: { userId, agentRunId: null, ...ws }, orderBy, take, select: { id: true, workspaceId: true, brandId: true, workflowId: true, model: true, status: true, costUsd: true, createdAt: true } }),
  ]);
  const runCost = await prisma.aiWorkflowRun.groupBy({ by: ["agentRunId"], where: { agentRunId: { in: tasks.map((t) => t.id) } }, _sum: { costUsd: true } });
  const cost = new Map(runCost.map((r) => [r.agentRunId, Number(r._sum.costUsd ?? 0)]));
  const { items, hasMore } = mergeTimeline(
    [
      visits.map((v) => ({ kind: "visit" as const, id: v.id, at: v.createdAt, workspaceId: v.workspaceId, brandId: v.brandId, detail: v.path, platform: v.platform })),
      actions.map((a) => ({ kind: "action" as const, id: a.id, at: a.createdAt, workspaceId: a.workspaceId, brandId: a.brandId, detail: a.action, entityType: a.entityType })),
      tasks.map((t) => ({ kind: "task" as const, id: t.id, at: t.createdAt, workspaceId: t.workspaceId, brandId: t.brandId, detail: t.agentKey, status: t.status, usd: cost.get(t.id) ?? 0 })),
      calls.map((c) => ({ kind: "ai" as const, id: c.id, at: c.createdAt, workspaceId: c.workspaceId, brandId: c.brandId, detail: c.workflowId, model: c.model, status: c.status, usd: Number(c.costUsd ?? 0) })),
    ],
    page,
  );
  const names = await namesFor(items);
  return { hasMore, items: items.map((i) => ({ ...i, ...names(i) })) };
}

/** The person, and what they've cost (in one workspace, or everywhere): AI calls and other paid APIs. Null if unknown. */
export async function personSummary({ userId, workspaceId }: { userId: string; workspaceId?: string }) {
  const ws = workspaceId ? { workspaceId } : {};
  const [user, ai, api] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }),
    prisma.aiWorkflowRun.aggregate({ where: { userId, ...ws }, _sum: { costUsd: true } }),
    prisma.apiCall.aggregate({ where: { userId, ...ws }, _sum: { costUsd: true } }),
  ]);
  return user ? { user, aiUsd: Number(ai._sum.costUsd ?? 0), apiUsd: Number(api._sum.costUsd ?? 0) } : null;
}
