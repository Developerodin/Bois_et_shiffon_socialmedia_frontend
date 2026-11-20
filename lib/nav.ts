/** The workspace route table: one list the sidebar, the top bar's breadcrumb and the panel read. */

import type { WebFeature } from "@/lib/features";
import { CONNECTIONS_READ } from "@/shared";

export type AgentKey = "spark" | "beat" | "wave" | "echo" | "pulse" | "hum" | "surge" | "drift";

export type NavEntry = {
  id: string;
  label: string;
  href: string;
  group: "main" | "create" | "customers" | "agent" | "more" | "admin";
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

export const NAV: readonly NavEntry[] = [
  { id: "overview", label: "Overview", href: "/", group: "main" },
  { id: "context", label: "Business context", href: "/context", group: "main", perm: ["agents.read"] },
  { id: "products", label: "Products", href: "/products", group: "main" },
  { id: "connections", label: "Connections", href: "/connections", group: "main", perm: CONNECTIONS_READ },
  { id: "automations", label: "Automations", href: "/automations", group: "main", feature: "automations" },

  { id: "library", label: "Brand & photos", href: "/library", group: "create", feature: "library" },
  { id: "photoshoot", label: "Photoshoot", href: "/photoshoot", group: "create", feature: "photoshoot" },
  { id: "reels", label: "Reels", href: "/reels", group: "create", feature: "reels", undocksAssistant: true },
  { id: "studio", label: "Studio", href: "/studio", group: "create", feature: "stories" },

  { id: "inbox", label: "Inbox", href: "/inbox", group: "customers", feature: "inbox", perm: ["inbox.read"] },

  { id: "spark", label: "Spark", href: "/agents/spark", group: "agent", role: "Sales & CRM", soon: true },
  { id: "beat", label: "Beat", href: "/agents/beat", group: "agent", role: "Projects & team", soon: true },
  { id: "wave", label: "Wave", href: "/?panel=content", group: "agent", role: "Content & marketing" },
  // Echo has no web inbox yet; it points at Connections until one exists.
  { id: "echo", label: "Echo", href: "/settings?tab=connections", group: "agent", role: "Communication", soon: true },
  { id: "pulse", label: "Pulse", href: "/agents/pulse", group: "agent", role: "Finance", soon: true },
  { id: "hum", label: "Hum", href: "/agents/hum", group: "agent", role: "Admin & access", soon: true },
  { id: "surge", label: "Surge", href: "/performance", group: "agent", role: "Growth & scale" },
  { id: "drift", label: "Drift", href: "/?panel=competitors", group: "agent", role: "Discovery" },

  { id: "calendar", label: "Calendar", href: "/?panel=content", group: "more" },
  { id: "performance", label: "Performance", href: "/performance", group: "more" },
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

const hrefPath = (href: string) => href.split(/[?#]/)[0] || "/";

/** Agents share paths with pages (Surge and Performance), so on a tie the page wins. */
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
