import { Prisma } from "@prisma/client";
import { LEGACY_ROLE_SLUG, PERMISSIONS, type PermissionKey } from "@/server/auth/permissions.catalog";
import { prisma } from "@/server/db/prisma";

/**
 * The platform admin console (/admin): every workspace and person, their roles and permissions, spend, usage and
 * logs. Read-only, except the audit records that an admin opened a workspace or a person (record*View).
 * Spend is the ledger's stored cost (AiWorkflowRun, ApiCall). Calls from before 2026-10-29 that have no stored
 * cost aren't counted here (npm run usage prices them from tokens).
 * Test-set calls are logged under workspace "eval"; they're left out of customer figures unless asked for.
 * ponytail: lists (workspaces, people) are loaded whole and filtered in memory; move filter/sort into SQL past a
 * few thousand rows. Logs page with skip/take (50 a page); keyset paging if someone pages deep into big logs.
 */
const DAY = 86_400_000;
export const PAGE = 50;
/** `?page=` as a page number: anything odd is page 1. ponytail: capped at 1000 (deep pages read more rows, see activity.ts). */
export const pageNumber = (v?: string) => {
  const n = Number(v);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 1000) : 1;
};
export const TEST_WORKSPACE = "eval";
const num = (d: Prisma.Decimal | number | null | undefined) => Number(d ?? 0);
const since = (days: number | null) => (days ? new Date(Date.now() - days * DAY) : undefined);

// ── Workspaces ──────────────────────────────────────────────────────────────

type Spend = { aiUsd: number; aiUsd30: number; apiUsd: number; apiUsd30: number; calls: number; calls30: number; apiCalls: number; apiCalls30: number; tokens: number; lastCall: Date | null };
const blankSpend = (): Spend => ({ aiUsd: 0, aiUsd30: 0, apiUsd: 0, apiUsd30: 0, calls: 0, calls30: 0, apiCalls: 0, apiCalls30: 0, tokens: 0, lastCall: null });
const addSpend = (rows: Spend[]) =>
  rows.reduce<Spend>((a, r) => ({ aiUsd: a.aiUsd + r.aiUsd, aiUsd30: a.aiUsd30 + r.aiUsd30, apiUsd: a.apiUsd + r.apiUsd, apiUsd30: a.apiUsd30 + r.apiUsd30, calls: a.calls + r.calls, calls30: a.calls30 + r.calls30, apiCalls: a.apiCalls + r.apiCalls, apiCalls30: a.apiCalls30 + r.apiCalls30, tokens: a.tokens + r.tokens, lastCall: null }), blankSpend());

/** Spend and usage keyed by workspace id ("" = no workspace), all time and the last 30 days. */
async function spendByWorkspace() {
  const d30 = since(30);
  const ai = (where: Prisma.AiWorkflowRunWhereInput) =>
    prisma.aiWorkflowRun.groupBy({ by: ["workspaceId"], where, _sum: { costUsd: true, inputTokens: true, outputTokens: true }, _count: { _all: true }, _max: { createdAt: true } });
  const api = (where: Prisma.ApiCallWhereInput) => prisma.apiCall.groupBy({ by: ["workspaceId"], where, _sum: { costUsd: true }, _count: { _all: true } });
  const [aiAll, ai30, apiAll, api30] = await Promise.all([ai({}), ai({ createdAt: { gte: d30 } }), api({}), api({ createdAt: { gte: d30 } })]);
  const out = new Map<string, Spend>();
  const get = (id: string | null) => out.get(id ?? "") ?? out.set(id ?? "", blankSpend()).get(id ?? "")!;
  for (const r of aiAll) Object.assign(get(r.workspaceId), { aiUsd: num(r._sum.costUsd), calls: r._count._all, tokens: (r._sum.inputTokens ?? 0) + (r._sum.outputTokens ?? 0), lastCall: r._max.createdAt });
  for (const r of ai30) Object.assign(get(r.workspaceId), { aiUsd30: num(r._sum.costUsd), calls30: r._count._all });
  for (const r of apiAll) Object.assign(get(r.workspaceId), { apiUsd: num(r._sum.costUsd), apiCalls: r._count._all });
  for (const r of api30) Object.assign(get(r.workspaceId), { apiUsd30: num(r._sum.costUsd), apiCalls30: r._count._all });
  return out;
}

/** Every workspace with its size, credits, spend and last activity, plus the platform totals. */
export async function platformOverview() {
  const [workspaces, spend, credits, users, audited, unpriced] = await Promise.all([
    prisma.workspace.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, slug: true, createdAt: true, owner: { select: { email: true, name: true } }, _count: { select: { members: true, brands: true } } },
    }),
    spendByWorkspace(),
    prisma.creditEntry.groupBy({ by: ["workspaceId"], _sum: { delta: true } }),
    prisma.user.count({ where: { deletedAt: null } }),
    // Last activity: the newest AI call or audit entry (sign-ins, approvals, role changes), whichever is later.
    prisma.auditEvent.groupBy({ by: ["workspaceId"], where: { workspaceId: { not: null } }, _max: { createdAt: true } }),
    // Calls logged before costs were stored (2026-10-29) aren't in the sums; say how many.
    prisma.aiWorkflowRun.count({ where: { costUsd: null, model: { not: "mock" }, status: { not: "FAILED" } } }),
  ]);
  const known = new Set(workspaces.map((w) => w.id));
  const rows = workspaces.map((w) => {
    const s = spend.get(w.id) ?? blankSpend();
    const seen = audited.find((a) => a.workspaceId === w.id)?._max.createdAt ?? null;
    const lastActive = [s.lastCall, seen].filter((d): d is Date => !!d).sort((a, b) => +b - +a)[0] ?? null;
    return { ...w, spend: s, lastActive, credits: credits.find((c) => c.workspaceId === w.id)?._sum.delta ?? 0 };
  });
  return {
    users,
    unpriced,
    workspaces: rows,
    // What customers cost, kept apart from the test set (which can dwarf it).
    customers: addSpend(rows.map((r) => r.spend)),
    tests: spend.get(TEST_WORKSPACE) ?? blankSpend(),
    // Spend no workspace owns: sign-in codes before an account has a workspace, and workspaces since deleted.
    unowned: addSpend([...spend].filter(([id]) => !known.has(id) && id !== TEST_WORKSPACE).map(([, s]) => s)),
  };
}

export type WorkspaceSort = "newest" | "spend" | "active" | "name";
export async function listWorkspaces({ q = "", sort = "newest", page = 1 }: { q?: string; sort?: WorkspaceSort; page?: number }) {
  const o = await platformOverview();
  const needle = q.trim().toLowerCase();
  const found = o.workspaces.filter((w) => !needle || w.name.toLowerCase().includes(needle) || (w.owner?.email ?? "").toLowerCase().includes(needle));
  const by: Record<WorkspaceSort, (a: (typeof found)[number], b: (typeof found)[number]) => number> = {
    newest: (a, b) => +b.createdAt - +a.createdAt,
    spend: (a, b) => b.spend.aiUsd30 + b.spend.apiUsd30 - (a.spend.aiUsd30 + a.spend.apiUsd30),
    active: (a, b) => +(b.lastActive ?? 0) - +(a.lastActive ?? 0),
    name: (a, b) => a.name.localeCompare(b.name),
  };
  found.sort(by[sort]);
  return { ...o, total: found.length, rows: found.slice((page - 1) * PAGE, page * PAGE), hasMore: found.length > page * PAGE };
}

export type MemberPermissions = { key: PermissionKey; description: string; via: string }[];
const DESCRIPTION = new Map<string, string>(PERMISSIONS.map(([key, , description]) => [key, description]));
const perms = (keys: string[], via: string): MemberPermissions => keys.map((key) => ({ key: key as PermissionKey, description: DESCRIPTION.get(key) ?? key, via }));

/**
 * One workspace's people, projects and roles. Roles are resolved as server/auth/permissions.ts does (the member's
 * role, or for older rows the built-in role their legacy enum maps to); on a project, workspace role ∪ that
 * project's role. scripts/check-platform-admin.ts compares this with effectivePermissions() for every member and
 * project.
 */
export async function workspaceDetail(workspaceId: string) {
  const [ws, credits, spend30, calls30] = await Promise.all([
    prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true, name: true, slug: true, createdAt: true,
        owner: { select: { email: true, name: true } },
        roles: { orderBy: [{ scope: "asc" }, { isSystem: "desc" }, { name: "asc" }] },
        members: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, email: true, name: true, status: true, createdAt: true } }, roleRef: true } },
        brands: {
          orderBy: { createdAt: "asc" },
          select: { id: true, displayName: true, status: true, createdAt: true, members: { include: { user: { select: { id: true, email: true, name: true } }, role: true } } },
        },
        invitations: { where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, orderBy: { createdAt: "desc" }, include: { role: { select: { name: true } }, brand: { select: { displayName: true } } } },
      },
    }),
    prisma.creditEntry.aggregate({ where: { workspaceId }, _sum: { delta: true } }),
    Promise.all([
      prisma.aiWorkflowRun.aggregate({ where: { workspaceId, createdAt: { gte: since(30) } }, _sum: { costUsd: true } }),
      prisma.apiCall.aggregate({ where: { workspaceId, createdAt: { gte: since(30) } }, _sum: { costUsd: true } }),
    ]),
    prisma.aiWorkflowRun.count({ where: { workspaceId, createdAt: { gte: since(30) } } }),
  ]);
  if (!ws) return null;

  const roleOf = (m: (typeof ws.members)[number]) => m.roleRef ?? ws.roles.find((r) => r.slug === LEGACY_ROLE_SLUG[m.role]) ?? null;
  const members = ws.members.map((m) => {
    const role = roleOf(m);
    return {
      user: m.user,
      joinedAt: m.createdAt,
      role: role ? { name: role.name, slug: role.slug } : null,
      workspacePermissions: perms(role?.permissions ?? [], role?.name ?? "–"),
      // Per project: what they can do there, and which role each permission comes from.
      projects: ws.brands.map((b) => {
        const grant = b.members.find((bm) => bm.userId === m.userId);
        const fromWs = new Set(role?.permissions ?? []);
        const extra = (grant?.role.permissions ?? []).filter((p) => !fromWs.has(p));
        return { brandId: b.id, brand: b.displayName, projectRole: grant?.role.name ?? null, effective: [...perms([...fromWs], role?.name ?? "–"), ...perms(extra, grant?.role.name ?? "–")] };
      }),
    };
  });

  return {
    workspace: { id: ws.id, name: ws.name, slug: ws.slug, createdAt: ws.createdAt, owner: ws.owner },
    credits: credits._sum.delta ?? 0,
    spend30: num(spend30[0]._sum.costUsd) + num(spend30[1]._sum.costUsd),
    calls30,
    members,
    brands: ws.brands.map((b) => ({ id: b.id, name: b.displayName, status: b.status, createdAt: b.createdAt, members: b.members.map((m) => ({ userId: m.userId, email: m.user.email, name: m.user.name, role: m.role.name })) })),
    roles: ws.roles.map((r) => ({ name: r.name, slug: r.slug, scope: r.scope, isSystem: r.isSystem, description: r.description, permissions: r.permissions, holders: ws.members.filter((m) => roleOf(m)?.id === r.id).length + ws.brands.reduce((n, b) => n + b.members.filter((bm) => bm.roleId === r.id).length, 0) })),
    invitations: ws.invitations.map((i) => ({ email: i.email, role: i.role.name, project: i.brand?.displayName ?? null, expiresAt: i.expiresAt })),
  };
}
export type WorkspaceDetail = NonNullable<Awaited<ReturnType<typeof workspaceDetail>>>;

// ── People ──────────────────────────────────────────────────────────────────

export async function listPeople({ q = "", page = 1 }: { q?: string; page?: number }) {
  const needle = q.trim();
  const where: Prisma.UserWhereInput = { deletedAt: null, ...(needle ? { OR: [{ email: { contains: needle, mode: "insensitive" } }, { name: { contains: needle, mode: "insensitive" } }] } : {}) };
  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE,
      take: PAGE,
      select: { id: true, email: true, name: true, status: true, isPlatformAdmin: true, createdAt: true, memberships: { select: { workspace: { select: { id: true, name: true } } } }, _count: { select: { brandMembers: true } } },
    }),
  ]);
  const signIns = await prisma.auditEvent.groupBy({ by: ["actorUserId"], where: { action: "auth.login", actorUserId: { in: users.map((u) => u.id) } }, _max: { createdAt: true } });
  return {
    total,
    hasMore: total > page * PAGE,
    rows: users.map((u) => ({ ...u, workspaces: u.memberships.map((m) => m.workspace), projectRoles: u._count.brandMembers, lastSignIn: signIns.find((s) => s.actorUserId === u.id)?._max.createdAt ?? null })),
  };
}

/** One person across the platform: every workspace and project they're in, with their role and what it allows. */
export async function personDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, email: true, name: true, status: true, isPlatformAdmin: true, createdAt: true,
      accounts: { select: { provider: true } },
      memberships: { orderBy: { createdAt: "asc" }, include: { roleRef: true, workspace: { select: { id: true, name: true, roles: true } } } },
      brandMembers: { include: { role: true, brand: { select: { id: true, displayName: true, workspaceId: true } } } },
    },
  });
  if (!user) return null;
  const [lastSignIn, runs] = await Promise.all([
    prisma.auditEvent.findFirst({ where: { actorUserId: userId, action: "auth.login" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
    prisma.agentRun.count({ where: { triggeredByUserId: userId } }),
  ]);
  const workspaces = user.memberships.map((m) => {
    const role = m.roleRef ?? m.workspace.roles.find((r) => r.slug === LEGACY_ROLE_SLUG[m.role]) ?? null;
    return {
      id: m.workspace.id,
      name: m.workspace.name,
      joinedAt: m.createdAt,
      role: role?.name ?? null,
      permissions: perms(role?.permissions ?? [], role?.name ?? "–"),
      projects: user.brandMembers.filter((b) => b.brand.workspaceId === m.workspace.id).map((b) => ({ id: b.brand.id, name: b.brand.displayName, role: b.role.name, permissions: perms(b.role.permissions, b.role.name) })),
    };
  });
  return {
    user: { id: user.id, email: user.email, name: user.name, status: user.status, isPlatformAdmin: user.isPlatformAdmin, createdAt: user.createdAt, signIn: [...new Set(["password", ...user.accounts.map((a) => a.provider)])] },
    lastSignIn: lastSignIn?.createdAt ?? null,
    runsStarted: runs,
    workspaces,
  };
}
export type PersonDetail = NonNullable<Awaited<ReturnType<typeof personDetail>>>;

// ── Spend ───────────────────────────────────────────────────────────────────

export type SpendScope = { days: number | null; workspaceId?: string; includeTests?: boolean };

/** The ledger rows a scope covers: a period, one workspace or all, with or without the test set. */
function scopeWhere({ days, workspaceId, includeTests }: SpendScope) {
  const from = since(days);
  return {
    ai: { ...(from ? { createdAt: { gte: from } } : {}), ...(workspaceId ? { workspaceId } : includeTests ? {} : { NOT: { workspaceId: TEST_WORKSPACE } }) } satisfies Prisma.AiWorkflowRunWhereInput,
    api: { ...(from ? { createdAt: { gte: from } } : {}), ...(workspaceId ? { workspaceId } : includeTests ? {} : { OR: [{ workspaceId: null }, { NOT: { workspaceId: TEST_WORKSPACE } }] }) } satisfies Prisma.ApiCallWhereInput,
    sql: Prisma.sql`${from ? Prisma.sql`AND "createdAt" >= ${from}` : Prisma.empty} ${workspaceId ? Prisma.sql`AND "workspaceId" = ${workspaceId}` : includeTests ? Prisma.empty : Prisma.sql`AND "workspaceId" IS DISTINCT FROM ${TEST_WORKSPACE}`}`,
  };
}

/** Spend and usage for a scope, broken down every way the console shows it, with one total per day. */
export async function spendBreakdown(scope: SpendScope) {
  const w = scopeWhere(scope);
  const [aiTotal, apiTotal, byWorkspace, byBrand, byModel, byTier, byTask, byApi, aiDays, apiDays] = await Promise.all([
    prisma.aiWorkflowRun.aggregate({ where: w.ai, _sum: { costUsd: true, inputTokens: true, cachedInputTokens: true, outputTokens: true }, _count: { _all: true } }),
    prisma.apiCall.aggregate({ where: w.api, _sum: { costUsd: true }, _count: { _all: true } }),
    scope.workspaceId ? Promise.resolve([]) : prisma.aiWorkflowRun.groupBy({ by: ["workspaceId"], where: w.ai, _sum: { costUsd: true }, _count: { _all: true } }),
    scope.workspaceId ? prisma.aiWorkflowRun.groupBy({ by: ["brandId"], where: w.ai, _sum: { costUsd: true }, _count: { _all: true } }) : Promise.resolve([]),
    prisma.aiWorkflowRun.groupBy({ by: ["model"], where: w.ai, _sum: { costUsd: true, inputTokens: true, cachedInputTokens: true, outputTokens: true }, _count: { _all: true } }),
    prisma.aiWorkflowRun.groupBy({ by: ["tier"], where: w.ai, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.aiWorkflowRun.groupBy({ by: ["workflowId"], where: w.ai, _sum: { costUsd: true }, _count: { _all: true }, orderBy: { _sum: { costUsd: "desc" } }, take: 25 }),
    prisma.apiCall.groupBy({ by: ["provider", "operation"], where: w.api, _sum: { costUsd: true }, _count: { _all: true } }),
    prisma.$queryRaw<{ day: Date; usd: Prisma.Decimal | null; calls: bigint }[]>`SELECT date_trunc('day', "createdAt") AS day, SUM("costUsd") AS usd, COUNT(*) AS calls FROM "AiWorkflowRun" WHERE TRUE ${w.sql} GROUP BY 1`,
    prisma.$queryRaw<{ day: Date; usd: Prisma.Decimal | null; calls: bigint }[]>`SELECT date_trunc('day', "createdAt") AS day, SUM("costUsd") AS usd, COUNT(*) AS calls FROM "ApiCall" WHERE TRUE ${w.sql} GROUP BY 1`,
  ]);
  // Names for the ids.
  const [workspaces, brands] = await Promise.all([
    prisma.workspace.findMany({ where: { id: { in: byWorkspace.map((r) => r.workspaceId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    prisma.brand.findMany({ where: { id: { in: byBrand.map((r) => r.brandId).filter((x): x is string => !!x) } }, select: { id: true, displayName: true } }),
  ]);
  // One row per day of the period (empty days included, so the chart's gaps are real), oldest first.
  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const first = scope.days ? new Date(Date.now() - (scope.days - 1) * DAY) : ([...aiDays, ...apiDays].map((r) => r.day).sort((a, b) => +a - +b)[0] ?? new Date());
  const days: { day: string; aiUsd: number; apiUsd: number; calls: number }[] = [];
  for (let t = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), first.getUTCDate()); t <= Date.now(); t += DAY) days.push({ day: dayKey(new Date(t)), aiUsd: 0, apiUsd: 0, calls: 0 });
  const at = new Map(days.map((d) => [d.day, d]));
  for (const r of aiDays) Object.assign(at.get(dayKey(r.day)) ?? {}, { aiUsd: num(r.usd), calls: Number(r.calls) });
  for (const r of apiDays) Object.assign(at.get(dayKey(r.day)) ?? {}, { apiUsd: num(r.usd) });

  const wsName = new Map(workspaces.map((x) => [x.id, x.name]));
  const brandName = new Map(brands.map((x) => [x.id, x.displayName]));
  const sortUsd = <T extends { usd: number }>(rows: T[]) => rows.sort((a, b) => b.usd - a.usd);
  return {
    aiUsd: num(aiTotal._sum.costUsd),
    apiUsd: num(apiTotal._sum.costUsd),
    calls: aiTotal._count._all,
    apiCalls: apiTotal._count._all,
    input: aiTotal._sum.inputTokens ?? 0,
    cached: aiTotal._sum.cachedInputTokens ?? 0,
    output: aiTotal._sum.outputTokens ?? 0,
    days,
    byWorkspace: sortUsd(byWorkspace.map((r) => ({ id: r.workspaceId, name: r.workspaceId === TEST_WORKSPACE ? "Test runs" : r.workspaceId ? (wsName.get(r.workspaceId) ?? "Deleted workspace") : "No workspace", usd: num(r._sum.costUsd), calls: r._count._all }))),
    byBrand: sortUsd(byBrand.map((r) => ({ name: (r.brandId && brandName.get(r.brandId)) ?? "Deleted project or none", usd: num(r._sum.costUsd), calls: r._count._all }))),
    byModel: sortUsd(byModel.map((r) => ({ model: r.model, usd: num(r._sum.costUsd), calls: r._count._all, input: r._sum.inputTokens ?? 0, cached: r._sum.cachedInputTokens ?? 0, output: r._sum.outputTokens ?? 0 }))),
    byTier: sortUsd(byTier.map((r) => ({ tier: r.tier ?? "before tiers", usd: num(r._sum.costUsd), calls: r._count._all }))),
    byTask: byTask.map((r) => ({ task: r.workflowId, usd: num(r._sum.costUsd), calls: r._count._all })),
    byApi: sortUsd(byApi.map((r) => ({ api: `${r.provider} ${r.operation}`, usd: num(r._sum.costUsd), calls: r._count._all }))),
  };
}
export type SpendBreakdown = Awaited<ReturnType<typeof spendBreakdown>>;

// ── Logs ────────────────────────────────────────────────────────────────────

export type LogKind = "audit" | "runs" | "events" | "calls";
/** What each log can be narrowed to (the `status` filter). */
export const LOG_FILTERS: Record<LogKind, { value: string; label: string }[]> = {
  audit: [{ value: "auth", label: "Sign-ins" }, { value: "platform", label: "Platform admin" }, { value: "content", label: "Content" }, { value: "member", label: "Members & roles" }],
  runs: [{ value: "FAILED", label: "Failed" }, { value: "SUCCEEDED", label: "Succeeded" }, { value: "RUNNING", label: "Running" }, { value: "QUEUED", label: "Queued" }],
  events: [{ value: "ERROR", label: "Errors" }, { value: "WARN", label: "Warnings" }, { value: "SUCCESS", label: "Successes" }, { value: "INFO", label: "Info" }],
  calls: [{ value: "FAILED", label: "Failed" }, { value: "ESCALATED", label: "Asked again" }, { value: "FELL_BACK", label: "Used a backup" }, { value: "flagged", label: "Checks flagged" }],
};

/** One page of a log, newest first, for the platform or one workspace (and, for the audit log, one person). */
export async function platformLogs({ kind, workspaceId, actorId, status, includeTests = false, page = 1 }: { kind: LogKind; workspaceId?: string; actorId?: string; status?: string; includeTests?: boolean; page?: number }) {
  const skip = (page - 1) * PAGE;
  const take = PAGE + 1; // one extra tells whether there's an older page
  const wsFilter = workspaceId ? { workspaceId } : {};
  const ok = (v: string | undefined) => (v && LOG_FILTERS[kind].some((f) => f.value === v) ? v : undefined);
  const s = ok(status);

  let rows: { at: Date; workspaceId: string | null; brandId: string | null; userId: string | null; [k: string]: unknown }[];
  if (kind === "audit") {
    const actionPrefix: Record<string, string[]> = { auth: ["auth."], platform: ["platform."], content: ["content.", "approval.", "publish"], member: ["member", "role", "invitation"] };
    const r = await prisma.auditEvent.findMany({
      where: { ...wsFilter, ...(actorId ? { actorUserId: actorId } : {}), ...(s ? { OR: actionPrefix[s].map((p) => ({ action: { startsWith: p } })) } : {}) },
      orderBy: { createdAt: "desc" }, skip, take,
    });
    rows = r.map((a) => ({ at: a.createdAt, workspaceId: a.workspaceId, brandId: a.brandId, userId: a.actorUserId, action: a.action, entityType: a.entityType, entityId: a.entityId }));
  } else if (kind === "runs") {
    const r = await prisma.agentRun.findMany({
      where: { ...wsFilter, ...(actorId ? { triggeredByUserId: actorId } : {}), ...(s ? { status: s as "FAILED" } : {}) },
      orderBy: { createdAt: "desc" }, skip, take,
      select: { id: true, workspaceId: true, brandId: true, agentKey: true, trigger: true, status: true, error: true, triggeredByUserId: true, createdAt: true, startedAt: true, finishedAt: true },
    });
    rows = r.map((x) => ({ at: x.createdAt, workspaceId: x.workspaceId, brandId: x.brandId, userId: x.triggeredByUserId, agent: x.agentKey, trigger: x.trigger, status: x.status, error: x.error, seconds: x.startedAt && x.finishedAt ? Math.round((+x.finishedAt - +x.startedAt) / 1000) : null }));
  } else if (kind === "events") {
    const r = await prisma.agentEvent.findMany({ where: { ...wsFilter, ...(actorId ? { run: { triggeredByUserId: actorId } } : {}), ...(s ? { level: s as "ERROR" } : {}) }, orderBy: { id: "desc" }, skip, take, select: { workspaceId: true, brandId: true, agentKey: true, level: true, message: true, createdAt: true } });
    rows = r.map((x) => ({ at: x.createdAt, workspaceId: x.workspaceId, brandId: x.brandId, userId: null, agent: x.agentKey, level: x.level, message: x.message }));
  } else {
    const r = await prisma.aiWorkflowRun.findMany({
      where: { ...(workspaceId ? { workspaceId } : includeTests ? {} : { NOT: { workspaceId: TEST_WORKSPACE } }), ...(actorId ? { userId: actorId } : {}), ...(s === "flagged" ? { evalPassed: false } : s ? { status: s } : {}) },
      orderBy: { createdAt: "desc" }, skip, take,
      select: { workspaceId: true, brandId: true, userId: true, workflowId: true, tier: true, model: true, status: true, costUsd: true, latencyMs: true, inputTokens: true, outputTokens: true, evalPassed: true, error: true, createdAt: true },
    });
    rows = r.map((c) => ({ at: c.createdAt, workspaceId: c.workspaceId, brandId: c.brandId, userId: c.userId, task: c.workflowId, tier: c.tier, model: c.model, status: c.status, usd: c.costUsd === null ? null : num(c.costUsd), ms: c.latencyMs, tokens: (c.inputTokens ?? 0) + (c.outputTokens ?? 0), checks: c.evalPassed, error: c.error }));
  }

  const hasMore = rows.length > PAGE;
  rows = rows.slice(0, PAGE);
  const names = await nameLookup(rows);
  return { hasMore, rows: rows.map((r) => ({ ...r, ...names(r) })) };
}

type Named = { userId?: string | null; workspaceId?: string | null; brandId?: string | null };
/** Names for the ids on a page of rows: people by email (incl. ones who've left), projects and workspaces. */
export async function nameLookup(rows: Named[]) {
  const ids = (k: keyof Named) => [...new Set(rows.map((r) => r[k]).filter((x): x is string => !!x))];
  const [people, brands, workspaces] = await Promise.all([
    prisma.user.findMany({ where: { id: { in: ids("userId") } }, select: { id: true, email: true } }),
    prisma.brand.findMany({ where: { id: { in: ids("brandId") } }, select: { id: true, displayName: true } }),
    prisma.workspace.findMany({ where: { id: { in: ids("workspaceId") } }, select: { id: true, name: true } }),
  ]);
  const person = new Map(people.map((p) => [p.id, p.email]));
  const brand = new Map(brands.map((b) => [b.id, b.displayName]));
  const ws = new Map(workspaces.map((w) => [w.id, w.name]));
  return (r: Named) => ({
    who: r.userId ? (person.get(r.userId) ?? "(deleted user)") : null,
    workspace: r.workspaceId === TEST_WORKSPACE ? "Test runs" : r.workspaceId ? (ws.get(r.workspaceId) ?? "(deleted workspace)") : null,
    brand: r.brandId ? (brand.get(r.brandId) ?? "(deleted project)") : null,
  });
}
export type LogRow = Awaited<ReturnType<typeof platformLogs>>["rows"][number];

/**
 * Choices for the workspace and person pickers (Logs, Activity). People are the workspace's members, plus the chosen
 * person if they've since left, so the filter still reads right.
 * ponytail: every workspace in one <select> is fine into the low thousands; past that, search like the Workspaces page.
 */
export async function pickerOptions(workspaceId?: string, userId?: string) {
  const [workspaces, members, chosen] = await Promise.all([
    prisma.workspace.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    workspaceId ? prisma.workspaceMember.findMany({ where: { workspaceId }, select: { user: { select: { id: true, email: true } } } }) : [],
    userId ? prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } }) : null,
  ]);
  const people = members.map((m) => ({ id: m.user.id, label: m.user.email })).sort((a, b) => a.label.localeCompare(b.label));
  if (workspaceId && chosen && !people.some((p) => p.id === chosen.id)) people.push({ id: chosen.id, label: `${chosen.email} (left)` });
  return { workspaces, people };
}
export type PickerOptions = Awaited<ReturnType<typeof pickerOptions>>;

// ── Audit of admin views ────────────────────────────────────────────────────

/** Opening someone's workspace is recorded in its audit log, so platform-admin access to customer data leaves a trace. */
export const recordWorkspaceView = (workspaceId: string, viewerUserId: string) =>
  prisma.auditEvent.create({ data: { workspaceId, actorUserId: viewerUserId, action: "platform.workspace_viewed", entityType: "Workspace", entityId: workspaceId } });

/** Opening a person's page is recorded too (no workspace: it spans them). */
export const recordPersonView = (userId: string, viewerUserId: string) =>
  prisma.auditEvent.create({ data: { actorUserId: viewerUserId, action: "platform.person_viewed", entityType: "User", entityId: userId } });
