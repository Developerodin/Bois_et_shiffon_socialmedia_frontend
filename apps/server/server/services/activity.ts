import { NO_WORKSPACE, type ActivitySort } from "@espanda/shared";
import { prisma } from "@/server/db/prisma";
import { cursorOf, type Cursor, nameLookup, olderThan, PAGE, TEST_WORKSPACE } from "@/server/services/platform-admin";

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

/** Admin console actions (viewing a workspace or person) are the admin's audit trail, in Logs › Audit; not customer activity. */
const NOT_ADMIN_CONSOLE = { NOT: { action: { startsWith: "platform." } } };

/** userId null: unattributed (system and scheduled runs, and AI calls from before people were recorded). */
type Counted = { userId: string | null; workspaceId: string | null; n?: number; usd?: number; last: Date };
export type ActivityCount = { userId: string | null; workspaceId: string | null; last: Date; visits: number; actions: number; tasks: number; usd: number };

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

export type { ActivitySort };
const BY: Record<ActivitySort, (r: ActivityCount) => number> = { active: (r) => +r.last, visits: (r) => r.visits, actions: (r) => r.actions, tasks: (r) => r.tasks, spend: (r) => r.usd };
/** Biggest first; ties stay most recently active first. */
export const sortActivity = (rows: ActivityCount[], sort: ActivitySort) => [...rows].sort((a, b) => BY[sort](b) - BY[sort](a) || +b.last - +a.last);

/**
 * Everyone's activity over a period, per workspace: five GROUP BYs merged in memory, sorted, then one page. Without a
 * person filter, each workspace also gets an unattributed row, so its spend adds up to the Spend page (test runs left
 * out, as there). `userIds` narrows to some people (a search).
 * ponytail: the period bounds the scan; "all time" over tens of millions of rows wants a daily summary table instead.
 */
export async function activityList({ workspaceId, userIds, days = null, sort = "active", page = 1 }: { workspaceId?: string; userIds?: string[]; days?: number | null; sort?: ActivitySort; page?: number }) {
  // Only for tables whose workspaceId is never null: NOT (workspaceId = 'eval') is false for NULL in SQL.
  const ws = workspaceId ? { workspaceId } : { NOT: { workspaceId: TEST_WORKSPACE } };
  const when = days ? { createdAt: { gte: new Date(Date.now() - days * 86_400_000) } } : {};
  const who = userIds ? { in: userIds } : undefined;
  const last = (g: { _max: { createdAt: Date | null } }) => g._max.createdAt!;
  const [visits, actions, tasks, ai, api] = await Promise.all([
    prisma.pageView.groupBy({ by: ["workspaceId", "userId"], where: { ...(workspaceId ? { workspaceId } : {}), ...when, ...(who ? { userId: who } : {}) }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.auditEvent.groupBy({ by: ["workspaceId", "actorUserId"], where: { ...(workspaceId ? { workspaceId } : {}), ...when, ...(who ? { actorUserId: who } : {}), ...NOT_ADMIN_CONSOLE }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.agentRun.groupBy({ by: ["workspaceId", "triggeredByUserId"], where: { ...ws, ...when, ...(who ? { triggeredByUserId: who } : {}) }, _count: { _all: true }, _max: { createdAt: true } }),
    prisma.aiWorkflowRun.groupBy({ by: ["workspaceId", "userId"], where: { ...ws, ...when, ...(who ? { userId: who } : {}) }, _sum: { costUsd: true }, _max: { createdAt: true } }),
    prisma.apiCall.groupBy({ by: ["workspaceId", "userId"], where: { ...(workspaceId ? { workspaceId } : { OR: [{ workspaceId: null }, { NOT: { workspaceId: TEST_WORKSPACE } }] }), ...when, ...(who ? { userId: who } : {}) }, _sum: { costUsd: true }, _max: { createdAt: true } }),
  ]);
  const sources = {
    visits: visits.map((g) => ({ userId: g.userId, workspaceId: g.workspaceId, n: g._count._all, last: last(g) })),
    actions: actions.map((g) => ({ userId: g.actorUserId, workspaceId: g.workspaceId, n: g._count._all, last: last(g) })),
    tasks: tasks.map((g) => ({ userId: g.triggeredByUserId, workspaceId: g.workspaceId, n: g._count._all, last: last(g) })),
    ai: ai.map((g) => ({ userId: g.userId, workspaceId: g.workspaceId, usd: Number(g._sum.costUsd ?? 0), last: last(g) })),
    api: api.map((g) => ({ userId: g.userId, workspaceId: g.workspaceId, usd: Number(g._sum.costUsd ?? 0), last: last(g) })),
  };
  // Accounts removed from the database (only smoke-test scripts do that; the app marks people deleted and keeps them)
  // have no name left: their activity joins the workspace's unattributed row.
  const ids = [...new Set(Object.values(sources).flatMap((list) => list.map((c) => c.userId).filter((x): x is string => !!x)))];
  const kept = new Set((await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((u) => u.id));
  const known = (list: Counted[]) => list.map((c) => (c.userId && !kept.has(c.userId) ? { ...c, userId: null } : c));
  const all = sortActivity(mergeActivityCounts({ visits: known(sources.visits), actions: known(sources.actions), tasks: known(sources.tasks), ai: known(sources.ai), api: known(sources.api) }), sort);
  const rows = all.slice((page - 1) * PAGE, page * PAGE);
  const names = await nameLookup(rows);
  return { total: all.length, hasMore: all.length > page * PAGE, rows: rows.map((r) => ({ ...r, ...names(r) })) };
}

export { NO_WORKSPACE };

// ── One person's timeline ───────────────────────────────────────────────────

export type TimelineItem = {
  kind: "visit" | "action" | "task" | "ai";
  id: string;
  at: Date;
  workspaceId: string | null;
  brandId: string | null;
  /** The path, the audit action, the agent, or the AI task */
  detail: string;
  platform?: string;
  status?: string;
  model?: string;
  usd?: number;
};
const KIND_ORDER = ["visit", "action", "task", "ai"];

/**
 * The newest page of several newest-first lists, merged: by time, then kind, then each list's own (database) order,
 * which is (createdAt desc, id desc). `next` is the cursor for the page after.
 */
export function mergeTimeline(lists: TimelineItem[][]) {
  const all = lists
    .flatMap((list) => list.map((item, i) => ({ item, i })))
    .sort((a, b) => +b.item.at - +a.item.at || KIND_ORDER.indexOf(a.item.kind) - KIND_ORDER.indexOf(b.item.kind) || a.i - b.i)
    .map((x) => x.item);
  const items = all.slice(0, PAGE);
  const hasMore = all.length > PAGE;
  return { items, hasMore, next: hasMore ? cursorOf(items[items.length - 1]) : undefined };
}

/**
 * The rows of one source (`kind`) that come after the cursor in the merged order above. Kinds earlier in the order
 * have already shown their rows at the cursor's time, later ones haven't; the cursor's own kind goes on by id.
 */
export function afterCursor(kind: TimelineItem["kind"], c?: Cursor) {
  if (!c) return {};
  const d = KIND_ORDER.indexOf(kind) - KIND_ORDER.indexOf(c.kind ?? "");
  if (d < 0) return { createdAt: { lt: c.at } };
  if (d > 0) return { createdAt: { lte: c.at } };
  return olderThan(c);
}

/**
 * Page visits, actions, agent tasks (cost = their AI calls) and AI calls outside agent runs (in practice chat turns:
 * task, model and cost, never text), newest first, over a period. An agent's own AI calls are folded into its task
 * row. Keyset paged (`before`), so every page reads at most 51 rows of each source; `total` counts them all.
 */
export async function personTimeline({ userId, workspaceId, days = null, before }: { userId: string; workspaceId?: string | null; days?: number | null; before?: Cursor }) {
  // undefined = everywhere; null = outside any workspace, where agent tasks and AI calls never are
  const ws = workspaceId === undefined ? {} : { workspaceId };
  const always = workspaceId !== null;
  if (before && !KIND_ORDER.includes(before.kind ?? "")) before = undefined; // a hand-edited cursor: start at the newest
  const take = PAGE + 1;
  const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
  const when = days ? { createdAt: { gte: new Date(Date.now() - days * 86_400_000) } } : {};
  const where = {
    visit: { userId, ...ws, ...when },
    action: { actorUserId: userId, ...ws, ...when, ...NOT_ADMIN_CONSOLE },
    task: { triggeredByUserId: userId, workspaceId: workspaceId ?? undefined, ...when },
    ai: { userId, agentRunId: null, workspaceId: workspaceId ?? undefined, ...when },
  };
  const page = <K extends keyof typeof where>(k: K) => ({ AND: [where[k], afterCursor(k, before)] });
  const [visits, actions, tasks, calls, counts] = await Promise.all([
    prisma.pageView.findMany({ where: page("visit"), orderBy, take }),
    prisma.auditEvent.findMany({ where: page("action"), orderBy, take, select: { id: true, workspaceId: true, brandId: true, action: true, createdAt: true } }),
    !always ? [] : prisma.agentRun.findMany({ where: page("task"), orderBy, take, select: { id: true, workspaceId: true, brandId: true, agentKey: true, status: true, createdAt: true } }),
    !always ? [] : prisma.aiWorkflowRun.findMany({ where: page("ai"), orderBy, take, select: { id: true, workspaceId: true, brandId: true, workflowId: true, model: true, status: true, costUsd: true, createdAt: true } }),
    Promise.all([
      prisma.pageView.count({ where: where.visit }),
      prisma.auditEvent.count({ where: where.action }),
      always ? prisma.agentRun.count({ where: where.task }) : 0,
      always ? prisma.aiWorkflowRun.count({ where: where.ai }) : 0,
    ]),
  ]);
  const runCost = !tasks.length ? [] : await prisma.aiWorkflowRun.groupBy({ by: ["agentRunId"], where: { agentRunId: { in: tasks.map((t) => t.id) } }, _sum: { costUsd: true } });
  const cost = new Map(runCost.map((r) => [r.agentRunId, Number(r._sum.costUsd ?? 0)]));
  const { items, hasMore, next } = mergeTimeline([
    visits.map((v) => ({ kind: "visit" as const, id: v.id, at: v.createdAt, workspaceId: v.workspaceId, brandId: v.brandId, detail: v.path, platform: v.platform })),
    actions.map((a) => ({ kind: "action" as const, id: a.id, at: a.createdAt, workspaceId: a.workspaceId, brandId: a.brandId, detail: a.action })),
    tasks.map((t) => ({ kind: "task" as const, id: t.id, at: t.createdAt, workspaceId: t.workspaceId, brandId: t.brandId, detail: t.agentKey, status: t.status, usd: cost.get(t.id) ?? 0 })),
    calls.map((c) => ({ kind: "ai" as const, id: c.id, at: c.createdAt, workspaceId: c.workspaceId, brandId: c.brandId, detail: c.workflowId, model: c.model, status: c.status, usd: Number(c.costUsd ?? 0) })),
  ]);
  const names = await nameLookup(items);
  return { total: counts.reduce((a, b) => a + b, 0), hasMore, next, items: items.map((i) => ({ ...i, ...names(i) })) };
}

/** The person (null once their account is deleted), and what they've cost (in one workspace, or everywhere) over a period: AI calls and other paid APIs. */
export async function personSummary({ userId, workspaceId, days = null }: { userId: string; workspaceId?: string | null; days?: number | null }) {
  const ws = workspaceId === undefined ? {} : { workspaceId };
  const when = days ? { createdAt: { gte: new Date(Date.now() - days * 86_400_000) } } : {};
  const [user, ai, api] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } }),
    workspaceId === null ? { _sum: { costUsd: null } } : prisma.aiWorkflowRun.aggregate({ where: { userId, workspaceId: workspaceId ?? undefined, ...when }, _sum: { costUsd: true } }),
    prisma.apiCall.aggregate({ where: { userId, ...ws, ...when }, _sum: { costUsd: true } }),
  ]);
  return { user, aiUsd: Number(ai._sum.costUsd ?? 0), apiUsd: Number(api._sum.costUsd ?? 0) };
}
