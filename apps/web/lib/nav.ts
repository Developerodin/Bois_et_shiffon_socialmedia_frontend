/** The workspace route table: one list the sidebar, the top bar's breadcrumb and the panel read. */

export type AgentKey = "spark" | "beat" | "wave" | "echo" | "pulse" | "hum" | "surge" | "drift";

export type NavEntry = {
  id: string;
  label: string;
  href: string;
  group: "main" | "agent" | "more" | "admin";
  role?: string;
  soon?: boolean;
  blurb?: string;
};

export const NAV: readonly NavEntry[] = [
  { id: "overview", label: "Overview", href: "/", group: "main" },
  { id: "context", label: "Business context", href: "/context", group: "main" },
  { id: "products", label: "Products", href: "/products", group: "main" },
  { id: "connections", label: "Connections", href: "/connections", group: "main" },

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

const hrefPath = (href: string) => href.split(/[?#]/)[0] || "/";

/** Agents share paths with pages (Surge and Performance), so on a tie the page wins. */
const rank = (e: NavEntry) => (e.group === "agent" ? 0 : 1);

/**
 * The entry a pathname belongs to: the longest href path that is the pathname or a parent of it, on whole segments.
 * "/" matches only itself. The query is ignored. Unknown paths read as the Overview, inside a business.
 */
export function navFor(pathname: string): { activeId: string | null; title: string; brandScoped: boolean } {
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
  // /agents/<anything> that isn't an agent is no page: don't call it the Agent log.
  if (best?.id === "agent-log" && path !== "/agents" && path !== "/agents/")
    return { activeId: null, title: "Page not found", brandScoped: true };
  if (!best) return { activeId: null, title: "Overview", brandScoped: !path.startsWith("/admin") };
  return { activeId: best.id, title: best.label, brandScoped: best.group !== "admin" };
}
