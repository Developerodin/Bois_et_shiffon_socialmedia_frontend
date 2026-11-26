/** The workspace route table: one list the sidebar, the top bar's breadcrumb and the panel read. */

import type { WebFeature } from "@/lib/features";
import { CONNECTIONS_READ } from "@/shared";

export type AgentKey = "spark" | "beat" | "wave" | "echo" | "pulse" | "hum" | "surge" | "drift";

export type NavEntry = {
  id: string;
  label: string;
  href: string;
  /** "page": titled by navFor but listed nowhere (its link is elsewhere, e.g. an agent slot). */
  group: "main" | "create" | "customers" | "agent" | "more" | "admin" | "page";
  role?: string;
  soon?: boolean;
  blurb?: string;
  /** Shown only while this flag is on for the workspace. */
  feature?: WebFeature;
  /** Shown only to roles holding one of these permissions on the business (the page and its API check it too). */
  perm?: readonly string[];
  /** The assistant is a drawer, not a docked column, on this page: it needs the full width. */
  undocksAssistant?: true;
};

const TASKS_READ = ["tasks.read"] as const;
const CRM_MANAGE = ["crm.manage"] as const;
/** The Sales tab on /performance (Pulse's slot) needs crm.read, not crm.manage. */
const PULSE_PERM = ["crm.read"] as const;
/** A workspace permission: Settings' Members tab works with no business picked. */
const MEMBERS_READ = ["members.read"] as const;

export const NAV: readonly NavEntry[] = [
  { id: "overview", label: "Overview", href: "/", group: "main" },
  { id: "context", label: "Business context", href: "/context", group: "main", perm: ["agents.read"] },
  { id: "products", label: "Products", href: "/products", group: "main" },
  { id: "connections", label: "Connections", href: "/connections", group: "main", perm: CONNECTIONS_READ },
  { id: "automations", label: "Automations", href: "/automations", group: "main", feature: "automations" },
  // One page (/tasks) under three names: the area comes from the query, which navFor ignores, so /tasks reads as the first.
  // Its own link is the Beat slot (agentEntries); this entry only gives the page its title. Not "more": the account
  // menu lists those without checking flags.
  { id: "tasks", label: "Projects & tasks", href: "/tasks", group: "page", feature: "tasks", perm: TASKS_READ },
  // Its link is on the tasks page; the sidebar highlights Beat's slot on it.
  { id: "projects", label: "Projects", href: "/projects", group: "page", feature: "tasks", perm: TASKS_READ },
  // Linked from the Overview's "This week".
  { id: "digest", label: "Weekly digest", href: "/digest", group: "page", feature: "digest" },
  { id: "website", label: "Website", href: "/tasks?area=website&view=open", group: "main", feature: "tasks", perm: TASKS_READ },
  { id: "blog", label: "Blog", href: "/blog", group: "main", feature: "blog" },
  { id: "seo", label: "Performance tasks", href: "/tasks?area=seo&view=open", group: "main", feature: "tasks", perm: TASKS_READ },

  { id: "library", label: "Brand & photos", href: "/library", group: "create", feature: "library" },
  { id: "photoshoot", label: "Photoshoot", href: "/photoshoot", group: "create", feature: "photoshoot" },
  { id: "reels", label: "Reels", href: "/reels", group: "create", feature: "reels", undocksAssistant: true },
  { id: "studio", label: "Studio", href: "/studio", group: "create", feature: "stories" },

  { id: "inbox", label: "Inbox", href: "/inbox", group: "customers", feature: "inbox", perm: ["inbox.read"] },
  // Its link is Spark's slot (agentEntries). Quotes only for now, so crm.manage; inbox.read joins with the stored inbox.
  { id: "crm", label: "Sales & CRM", href: "/crm", group: "page", feature: "crm", perm: CRM_MANAGE },
  // Its link is Drift's slot; this entry gives the page its title (the page wins the tie with Drift's href).
  { id: "competitors", label: "Competitors", href: "/competitors", group: "page" },

  { id: "spark", label: "Spark", href: "/agents/spark", group: "agent", role: "Sales & CRM", soon: true },
  { id: "beat", label: "Beat", href: "/agents/beat", group: "agent", role: "Projects & team", soon: true },
  { id: "wave", label: "Wave", href: "/?panel=content", group: "agent", role: "Content calendar" },
  // Echo has no web inbox yet; it points at Connections until one exists.
  { id: "echo", label: "Echo", href: "/settings?tab=connections", group: "agent", role: "Communication", soon: true },
  { id: "pulse", label: "Pulse", href: "/agents/pulse", group: "agent", role: "Finance", soon: true },
  { id: "hum", label: "Hum", href: "/agents/hum", group: "agent", role: "Admin & access", soon: true },
  { id: "surge", label: "Surge", href: "/performance", group: "agent", role: "Growth reports" },
  { id: "drift", label: "Drift", href: "/competitors", group: "agent", role: "Competitors" },

  { id: "calendar", label: "Content calendar", href: "/?panel=content", group: "more" },
  { id: "performance", label: "Growth reports", href: "/performance", group: "more" },
  { id: "agent-log", label: "Agent log", href: "/agents", group: "more" },
  { id: "settings", label: "Settings", href: "/settings", group: "more" },

  { id: "admin", label: "Admin", href: "/admin", group: "admin" },
];

type SidebarGroup = { id: "main" | "create" | "customers"; label: string | null; entries: NavEntry[] };

/**
 * The sidebar's lists: the main one, then Create and Customers, each only when one of its entries is enabled.
 * `perms`: the role's permissions on the business; entries needing one it lacks are left out (none given: no filter).
 */
export function sidebarGroups(enabled: readonly WebFeature[], perms?: readonly string[]): SidebarGroup[] {
  const shown = (e: NavEntry) => (!e.feature || enabled.includes(e.feature)) && (!e.perm || !perms || e.perm.some((p) => perms.includes(p)));
  const groups: SidebarGroup[] = [
    { id: "main", label: null, entries: NAV.filter((e) => e.group === "main" && shown(e)) },
    { id: "create", label: "Create", entries: NAV.filter((e) => e.group === "create" && shown(e)) },
    { id: "customers", label: "Customers", entries: NAV.filter((e) => e.group === "customers" && shown(e)) },
  ];
  return groups.filter((g) => g.id === "main" || g.entries.length > 0);
}

/**
 * The agents as the sidebar lists them; a slot opens a real page instead of its coming-soon one when:
 * - Beat ("Projects & team"): the tasks flag and tasks.read, to Projects & tasks.
 * - Spark ("Sales & CRM"): the crm flag and crm.manage (who can open /crm), to /crm.
 * - Pulse ("Finance"): the sales flag and crm.read, to the Sales tab of /performance.
 * - Hum ("Admin & access"): members.read in the workspace (`workspacePerms`), to Settings' Members tab.
 * Echo stays coming soon: there is no web inbox page yet.
 * `perms`: the role's permissions on the business. Either list undefined: no filter (as in sidebarGroups), so with
 * `workspacePerms` undefined Hum is live.
 */
export function agentEntries(enabled: readonly WebFeature[], perms?: readonly string[], workspacePerms?: readonly string[]): NavEntry[] {
  const holds = (keys: readonly string[], list = perms) => !list || keys.some((p) => list.includes(p));
  const overrides: Record<string, Partial<NavEntry> | undefined> = {
    beat: enabled.includes("tasks") && holds(TASKS_READ) ? { role: "Projects & tasks", href: "/tasks" } : undefined,
    spark: enabled.includes("crm") && holds(CRM_MANAGE) ? { href: "/crm" } : undefined,
    pulse: enabled.includes("sales") && holds(PULSE_PERM) ? { href: "/performance?tab=sales" } : undefined,
    hum: holds(MEMBERS_READ, workspacePerms) ? { href: "/settings?tab=members" } : undefined,
  };
  return NAV.filter((e) => e.group === "agent").map((e) => (overrides[e.id] ? { ...e, ...overrides[e.id], soon: false } : e));
}

/**
 * The sidebar entry a URL belongs to. Agents that point at a page, a tab or a panel are selected by where you are;
 * Pulse and Hum (a tab of a page) only while `live` (ids of agents not coming soon) holds them.
 */
export function activeIdFor(pathname: string, search: { get(name: string): string | null }, live: ReadonlySet<string>): string | null {
  const panel = search.get("panel");
  if (pathname === "/" && panel === "content") return "wave";
  if (pathname === "/performance") return search.get("tab") === "sales" && live.has("pulse") ? "pulse" : "surge";
  if (pathname === "/settings" && search.get("tab") === "members" && live.has("hum")) return "hum";
  // /tasks is told apart by ?area=: Website, Performance (area=seo), else Beat's Projects & tasks slot.
  if (pathname === "/tasks") return search.get("area") === "website" ? "website" : search.get("area") === "seo" ? "seo" : "beat";
  if (pathname === "/projects" || pathname.startsWith("/projects/")) return "beat";
  if (pathname === "/crm" || pathname.startsWith("/crm/")) return "spark";
  if (pathname === "/competitors") return "drift";
  return navFor(pathname).activeId;
}

const hrefPath = (href: string) => href.split(/[?#]/)[0] || "/";

/** Agents share paths with pages (Surge and Growth reports), so on a tie the page wins. */
const rank = (e: NavEntry) => (e.group === "agent" ? 0 : 1);

/**
 * The entry a pathname belongs to: the longest href path that is the pathname or a parent of it, on whole segments.
 * "/" matches only itself. The query is ignored.
 */
export function navEntryFor(pathname: string): NavEntry | null {
  const path = pathname.split(/[?#]/)[0] || "/";
  let best: NavEntry | null = null;
  let bestLen = -1;
  for (const e of NAV) {
    const p = hrefPath(e.href);
    const hit = p === "/" ? path === "/" : path === p || path.startsWith(`${p}/`);
    if (!hit) continue;
    if (p.length > bestLen || (p.length === bestLen && best && rank(e) > rank(best))) {
      best = e;
      bestLen = p.length;
    }
  }
  return best;
}

/** Whether the assistant sits as a column beside the page (from 1280 px up); false where the page needs the width. */
export function assistantDocks(pathname: string): boolean {
  return !navEntryFor(pathname)?.undocksAssistant;
}

/** The title and scope for a pathname. Unknown paths read as the Overview, inside a business. */
export function navFor(pathname: string): { activeId: string | null; title: string; brandScoped: boolean } {
  const path = pathname.split(/[?#]/)[0] || "/";
  const best = navEntryFor(pathname);
  // /agents/<anything> that isn't an agent is no page: don't call it the Agent log.
  if (best?.id === "agent-log" && path !== "/agents" && path !== "/agents/")
    return { activeId: null, title: "Page not found", brandScoped: true };
  if (!best) return { activeId: null, title: "Overview", brandScoped: !path.startsWith("/admin") };
  return { activeId: best.id, title: best.label, brandScoped: best.group !== "admin" };
}
