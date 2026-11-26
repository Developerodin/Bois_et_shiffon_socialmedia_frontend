import { DOC_KINDS, RUN_ID_PATTERN, type ContextDocKind } from "@/shared";

/**
 * The Overview's panels. Competitors left for its own page (/competitors): saved layouts drop the id when read
 * (panel-layout's sanitize), and the Overview's page sends /?panel=competitors there.
 */
export const PANEL_IDS = ["context", "home", "ideas", "content", "analytics", "feed", "log"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

/** What the Overview has open. `run` starts the agent on open; `runId` shows one finished run's events. */
export type View =
  | { kind: "home" }
  | { kind: "doc"; doc: ContextDocKind }
  | { kind: "agent"; key: string; run?: boolean; runId?: string }
  | { kind: "content"; id: string }
  | { kind: "competitor"; id: string }
  | { kind: "task"; id: string }
  | { kind: "panel"; id: PanelId };

// ?peek= is a panel shown in the peek; not ?panel=, which puts a panel on the board.
const ITEM_PARAMS = ["post", "doc", "agent", "competitor", "task", "peek"];
/** A post's, competitor's or task's id as the server makes them (cuid-like). */
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** An agent key's shape. There's no static list of agents: the Overview drops unknown ones once the list loads. */
const AGENT_KEY = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * The view for a URL parameter name (post, doc, agent, competitor, task) and its value, or home when either is unknown or
 * malformed. Never sets `run`: a link, a reload or Recent must not start a paid run.
 */
export function parseViewParts(kind: string, id: string): View {
  if (kind === "post" && ITEM_ID.test(id)) return { kind: "content", id };
  if (kind === "doc" && (DOC_KINDS as readonly string[]).includes(id)) return { kind: "doc", doc: id as ContextDocKind };
  if (kind === "agent" && AGENT_KEY.test(id)) return { kind: "agent", key: id };
  if (kind === "competitor" && ITEM_ID.test(id)) return { kind: "competitor", id };
  if (kind === "task" && ITEM_ID.test(id)) return { kind: "task", id };
  if (kind === "peek" && (PANEL_IDS as readonly string[]).includes(id)) return { kind: "panel", id: id as PanelId };
  return { kind: "home" };
}

/** The open item lives in the URL (?post=, ?doc=, ?agent=[&runId=], ?competitor=, ?task=, ?peek=). */
export function viewFromSearch(search: string): View {
  const q = new URLSearchParams(search);
  for (const kind of ITEM_PARAMS) {
    const id = q.get(kind);
    if (!id) continue;
    const v = parseViewParts(kind, id);
    const runId = q.get("runId");
    return v.kind === "agent" && runId && RUN_ID_PATTERN.test(runId) ? { ...v, runId } : v;
  }
  return { kind: "home" };
}

/** The URL's search for a view, keeping the parameters that aren't about the view (filters, ?panel=). */
export function viewToSearch(v: View, search: string, pathname: string): string {
  const q = new URLSearchParams(search);
  for (const k of [...ITEM_PARAMS, "runId"]) q.delete(k);
  if (v.kind === "content") q.set("post", v.id);
  if (v.kind === "doc") q.set("doc", v.doc);
  if (v.kind === "agent") {
    q.set("agent", v.key);
    if (v.runId) q.set("runId", v.runId);
  }
  if (v.kind === "competitor") q.set("competitor", v.id);
  if (v.kind === "task") q.set("task", v.id);
  if (v.kind === "panel") q.set("peek", v.id);
  const s = q.toString();
  return s ? `?${s}` : pathname;
}

/** The pages with a task peek of their own (the Overview, /tasks, a project page). */
const hasTaskPeek = (pathname: string) => pathname === "/" || pathname === "/tasks" || pathname.startsWith("/projects/");

/**
 * Where a task opens from the shell (the bell, search, quick create): this page's side peek when it has one (replacing
 * the item open there), else the /tasks page's.
 */
export function taskHref(pathname: string, search: string, id: string): string {
  if (!hasTaskPeek(pathname)) return `/tasks?task=${encodeURIComponent(id)}`;
  const s = viewToSearch({ kind: "task", id }, search, pathname);
  return `${pathname}${s}`;
}

/** Where a post opens from the shell: the Overview's peek (keeping the Overview's other parameters when already there). */
export function postHref(pathname: string, search: string, id: string): string {
  return pathname === "/" ? `/${viewToSearch({ kind: "content", id }, search, "/")}` : `/?post=${encodeURIComponent(id)}`;
}

/**
 * Where an old link to the Overview's Competitors panel (/?panel=competitors) goes now: the Competitors page, opening the
 * competitor it named (?competitor=) when that is a well-formed id. Null when the link isn't one of those.
 */
export function competitorsRedirect(panel: unknown, competitor: unknown): string | null {
  if (panel !== "competitors") return null;
  const v = typeof competitor === "string" ? parseViewParts("competitor", competitor) : null;
  return v?.kind === "competitor" ? `/competitors?competitor=${encodeURIComponent(v.id)}` : "/competitors";
}

/** `href` stays on `pathname` (only its query changes): no page is left, so nothing needs asking before it. */
export const samePage = (href: string, pathname: string) => href === pathname || href.startsWith(`${pathname}?`);

type Nav = { push: (href: string, o?: { scroll?: boolean }) => void; replace: (href: string, o?: { scroll?: boolean }) => void };

/**
 * Go to `href`. Only this page's query changing (a filter, opening or closing a peek) goes through the browser's
 * history, which useSearchParams follows: router.push/replace would fetch the whole page from the server again, seconds
 * each time against a distant database. Another page still goes through the router.
 */
export function navigate(router: Nav, href: string, pathname: string, mode: "push" | "replace" = "push") {
  if (samePage(href, pathname)) window.history[mode === "push" ? "pushState" : "replaceState"](null, "", href);
  else router[mode](href, { scroll: false });
}

/** A link's plain click onto this same page: the history instead of a server round trip. New-tab clicks are left alone. */
export function shallowClick(e: { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; preventDefault: () => void }, href: string, pathname: string) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !samePage(href, pathname)) return;
  e.preventDefault();
  window.history.pushState(null, "", href);
}

/** One item, whatever run it shows: a replaced item remounts fresh, a new runId on the same agent doesn't. */
export function peekKey(v: View): string {
  switch (v.kind) {
    case "content":
    case "competitor":
    case "task":
    case "panel":
      return `${v.kind}:${v.id}`;
    case "doc":
      return `doc:${v.doc}`;
    case "agent":
      return `agent:${v.key}`;
    case "home":
      return "home";
  }
}

/** Where the peek's item lives, above its title. */
export function peekCrumb(v: View): string {
  switch (v.kind) {
    case "content":
      return "Content calendar › Post";
    case "doc":
      return "Context › Document";
    case "agent":
      return "Agents";
    case "competitor":
      return "Competitors";
    case "task":
      return "Tasks › Task";
    case "panel":
      return "Panel";
    case "home":
      return "";
  }
}

/** An agent's key as a readable name until its real one loads: "content-ideas" → "Content ideas agent". */
export function agentLabel(key: string): string {
  const words = key.replace(/-+/g, " ").trim();
  return words ? `${words[0].toUpperCase()}${words.slice(1)} agent` : "Agent";
}

/** The peek's title: the item's name when the Overview knows it, else what kind of thing it is. */
export function peekTitle(v: View, known: string | null | undefined): string {
  const name = known?.trim();
  if (name) return name;
  switch (v.kind) {
    case "content":
      return "Post";
    case "doc":
      return "Document";
    case "agent":
      return agentLabel(v.key);
    case "competitor":
      return "Competitor";
    case "task":
      return "Task";
    case "panel":
      return "Panel";
    case "home":
      return "";
  }
}

/** The URL names an item, valid or not: one that parses to home was a bad link, and is replaced rather than kept in history. */
export function namesItem(search: string): boolean {
  const q = new URLSearchParams(search);
  return ITEM_PARAMS.some((k) => q.has(k));
}

/**
 * The Overview's URL without what belongs to the old brand (the open item, and the calendar's campaign filter), or null
 * when there's nothing to drop (or not the Overview). A brand switch uses it: the new brand's Overview must not open
 * that item or filter by a campaign it doesn't have. The other cf_ filters stay.
 */
export function withoutOpenItem(search: string, pathname: string): string | null {
  // A project belongs to the old brand: its page gives way to the new brand's projects.
  if (pathname.startsWith("/projects/")) return "/projects";
  // /tasks opens a task peek too (?task=); nothing else of it belongs to a brand.
  if (pathname === "/tasks") {
    if (!new URLSearchParams(search).has("task")) return null;
    return viewToSearch({ kind: "home" }, search, pathname);
  }
  // /competitors opens a competitor or the Competitors agent in its peek; the competitor belongs to the old brand.
  if (pathname === "/competitors") return namesItem(search) ? viewToSearch({ kind: "home" }, search, pathname) : null;
  if (pathname !== "/") return null;
  const q = new URLSearchParams(search);
  const hadCampaign = q.has("cf_campaignId");
  q.delete("cf_campaignId");
  if (!namesItem(search) && !hadCampaign) return null;
  return viewToSearch({ kind: "home" }, q.toString(), pathname);
}

// The URL dropOpenItem just wrote. The Overview reads it once, on the URL change that write causes, and doesn't ask
// about unsaved work again: the person already agreed in the switcher. Set only on the Overview, the task pages
// (TaskPeek) and /competitors (CompetitorsBoard), where that read follows.
let agreedUrl: string | null = null;

/**
 * After the person agreed to leave (a brand or workspace switch): takes the open item out of the URL. When the page
 * itself belongs to the old brand (a project's), returns where to go instead; the caller navigates there.
 */
export function dropOpenItem(): string | null {
  const next = withoutOpenItem(window.location.search, window.location.pathname);
  if (next === null) return null;
  if (next.startsWith("/") && next !== window.location.pathname) return next;
  agreedUrl = next;
  window.history.replaceState(null, "", next);
  return null;
}

/** True once when `url` is the one dropOpenItem wrote; always clears it. */
export function agreedToDrop(url: string): boolean {
  const ok = agreedUrl === url;
  agreedUrl = null;
  return ok;
}
