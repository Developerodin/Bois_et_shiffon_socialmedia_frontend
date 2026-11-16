import type { PermissionKey } from "../permissions";

/** The platform admin console's API (GET /api/v1/admin/...). Dates are ISO strings; spend-bearing responses carry the USD to INR rate. */

/** Rows per page of every list; also the size of a log or timeline page. */
export const ADMIN_PAGE_SIZE = 50;

/** `?ws=` value for activity outside any workspace (the Activity list's "no workspace" rows). */
export const NO_WORKSPACE = "none";

/** The period switch (Spend, Activity, Logs): `?days=` 7, 30 (the default, left out of the URL), 90 or all. */
export const PERIODS = [
  { value: "7", label: "7 days" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "all", label: "All time" },
];
export function period(v?: string) {
  const value = PERIODS.some((p) => p.value === v) ? v! : "30";
  return { value, days: value === "all" ? null : Number(value), param: value === "30" ? undefined : value, span: value === "all" ? "all time" : `last ${value} days` };
}

export const WORKSPACE_SORTS = ["newest", "spend", "active", "name"] as const;
export type WorkspaceSort = (typeof WORKSPACE_SORTS)[number];
export const ACTIVITY_SORTS = ["active", "visits", "actions", "tasks", "spend"] as const;
export type ActivitySort = (typeof ACTIVITY_SORTS)[number];
export type LogKind = "audit" | "runs" | "events" | "calls";

/** What one role grants, and the role it comes from. */
export type MemberPermissions = { key: PermissionKey; description: string; via: string }[];

type Named = { who: string | null; workspace: string | null; brand: string | null };
/** `rows` of a list that has pages: offset pages (`next` is the next page number) or keyset pages (`next` is the cursor). */
type Paged = { total: number; pages: number; next: string | null };
type Fx = { usdInr: number | null };

export type AdminSpendTotals = {
  aiUsd: number; aiUsd30: number; apiUsd: number; apiUsd30: number;
  calls: number; calls30: number; apiCalls: number; apiCalls30: number;
  tokens: number; lastCall: string | null;
};

/** GET /admin/overview: the platform totals and its five costliest workspaces (last 30 days). */
export type AdminOverview = Fx & {
  users: number;
  unpriced: number;
  workspaceCount: number;
  customers: AdminSpendTotals;
  tests: AdminSpendTotals;
  top: { id: string; name: string; spend: AdminSpendTotals; lastActive: string | null }[];
};

/** One log row: the fields every kind has, plus the kind's own (action, agent, status, cost...). */
export type AdminLogRow = Named & {
  id: string | number;
  at: string;
  workspaceId: string | null;
  brandId: string | null;
  userId: string | null;
  [field: string]: unknown;
};
/** GET /admin/logs?log=&status=&days=&before=&ws=&who=&tests=&workspaceId= */
export type AdminLogsResponse = Paged & Fx & {
  kind: LogKind;
  /** The status filter as understood: null when the one asked for isn't one of `filters`. */
  status: string | null;
  filters: { value: string; label: string }[];
  rows: AdminLogRow[];
  /** The workspace picker's options; null for one workspace's logs. */
  workspaces: { id: string; name: string }[] | null;
};

/** GET /admin/spend?days=&tests=&workspaceId= */
export type AdminSpend = Fx & {
  aiUsd: number;
  apiUsd: number;
  calls: number;
  apiCalls: number;
  input: number;
  cached: number;
  output: number;
  days: { day: string; aiUsd: number; apiUsd: number; calls: number }[];
  byWorkspace: { id: string | null; name: string; usd: number; calls: number }[];
  byBrand: { name: string; usd: number; calls: number }[];
  byModel: { model: string; usd: number; calls: number; input: number; cached: number; output: number }[];
  byTier: { tier: string; usd: number; calls: number }[];
  byTask: { task: string; usd: number; calls: number }[];
  byApi: { api: string; usd: number; calls: number }[];
};

/** GET /admin/activity?ws=&who=&days=&sort=&page= */
export type AdminActivityList = Paged & Fx & {
  page: number;
  rows: (Named & { userId: string | null; workspaceId: string | null; last: string; visits: number; actions: number; tasks: number; usd: number })[];
  workspaces: { id: string; name: string }[];
};

/** GET /admin/activity/:userId?ws=&days=&before= */
export type AdminPersonTimeline = Paged & Fx & {
  /** Null once the account is deleted. */
  user: { id: string; name: string | null; email: string } | null;
  aiUsd: number;
  apiUsd: number;
  items: (Named & {
    kind: "visit" | "action" | "task" | "ai";
    id: string;
    at: string;
    workspaceId: string | null;
    brandId: string | null;
    detail: string;
    platform?: string;
    status?: string;
    model?: string;
    usd?: number;
  })[];
  workspaces: { id: string; name: string }[];
};

/** GET /admin/people?q=&page= */
export type AdminPeople = Paged & {
  page: number;
  rows: {
    id: string;
    email: string;
    name: string | null;
    status: string;
    isPlatformAdmin: boolean;
    createdAt: string;
    workspaces: { id: string; name: string }[];
    projectRoles: number;
    lastSignIn: string | null;
  }[];
};

/** GET /admin/people/:userId */
export type AdminPerson = {
  user: { id: string; email: string; name: string | null; status: string; isPlatformAdmin: boolean; createdAt: string; signIn: string[] };
  lastSignIn: string | null;
  runsStarted: number;
  workspaces: {
    id: string;
    name: string;
    joinedAt: string;
    role: string | null;
    permissions: MemberPermissions;
    projects: { id: string; name: string; role: string; permissions: MemberPermissions }[];
  }[];
  /** Their latest audit entries. */
  audit: AdminLogRow[];
};

/** GET /admin/workspaces?q=&sort=&page= */
export type AdminWorkspaces = Paged & Fx & {
  page: number;
  /** Every customer's spend over the last 30 days, for each row's share bar. */
  customers30: number;
  rows: {
    id: string;
    name: string;
    slug: string;
    createdAt: string;
    owner: { email: string; name: string | null } | null;
    _count: { members: number; brands: number };
    spend: AdminSpendTotals;
    lastActive: string | null;
    credits: number;
  }[];
};

/** GET /admin/workspaces/:workspaceId */
export type AdminWorkspaceDetail = {
  workspace: { id: string; name: string; slug: string; createdAt: string; owner: { email: string; name: string | null } | null };
  credits: number;
  spend30: number;
  calls30: number;
  members: {
    user: { id: string; email: string; name: string | null; status: string; createdAt: string };
    joinedAt: string;
    role: { name: string; slug: string } | null;
    workspacePermissions: MemberPermissions;
    projects: { brandId: string; brand: string; projectRole: string | null; effective: MemberPermissions }[];
  }[];
  brands: { id: string; name: string; status: string; createdAt: string; members: { userId: string; email: string; name: string | null; role: string }[] }[];
  roles: { name: string; slug: string; scope: "WORKSPACE" | "PROJECT"; isSystem: boolean; description: string | null; permissions: string[]; holders: number }[];
  invitations: { email: string; role: string; project: string | null; expiresAt: string }[];
};

/** GET /admin/workspaces/:workspaceId/header: what the workspace pages' shared header and tabs show. */
export type AdminWorkspaceHeader = {
  name: string;
  createdAt: string;
  owner: { email: string } | null;
  _count: { members: number; brands: number; roles: number };
};
