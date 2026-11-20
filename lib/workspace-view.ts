import { DOC_KINDS, RUN_ID_PATTERN, type ContextDocKind } from "@/shared";

/** The Overview's panels. */
export const PANEL_IDS = ["context", "home", "ideas", "content", "competitors", "analytics", "feed", "log"] as const;
export type PanelId = (typeof PANEL_IDS)[number];

/** What the Overview has open. `run` starts the agent on open; `runId` shows one finished run's events. */
export type View =
  | { kind: "home" }
  | { kind: "doc"; doc: ContextDocKind }
  | { kind: "agent"; key: string; run?: boolean; runId?: string }
  | { kind: "content"; id: string }
  | { kind: "competitor"; id: string }
  | { kind: "panel"; id: PanelId };

// ?peek= is a panel shown in the peek; not ?panel=, which puts a panel on the board.
const ITEM_PARAMS = ["post", "doc", "agent", "competitor", "peek"];
/** A post's or competitor's id as the server makes them (cuid-like). */
const ITEM_ID = /^[A-Za-z0-9_-]{1,64}$/;
/** An agent key's shape. There's no static list of agents: the Overview drops unknown ones once the list loads. */
const AGENT_KEY = /^[a-z][a-z0-9-]{0,39}$/;

/**
 * The view for a URL parameter name (post, doc, agent, competitor) and its value, or home when either is unknown or
 * malformed. Never sets `run`: a link, a reload or Recent must not start a paid run.
 */
export function parseViewParts(kind: string, id: string): View {
  if (kind === "post" && ITEM_ID.test(id)) return { kind: "content", id };
  if (kind === "doc" && (DOC_KINDS as readonly string[]).includes(id)) return { kind: "doc", doc: id as ContextDocKind };
  if (kind === "agent" && AGENT_KEY.test(id)) return { kind: "agent", key: id };
  if (kind === "competitor" && ITEM_ID.test(id)) return { kind: "competitor", id };
  if (kind === "peek" && (PANEL_IDS as readonly string[]).includes(id)) return { kind: "panel", id: id as PanelId };
  return { kind: "home" };
}

/** The open item lives in the URL (?post=, ?doc=, ?agent=[&runId=], ?competitor=, ?peek=). */
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
  for (const k of ["post", "doc", "agent", "competitor", "peek", "runId"]) q.delete(k);
  if (v.kind === "content") q.set("post", v.id);
  if (v.kind === "doc") q.set("doc", v.doc);
  if (v.kind === "agent") {
    q.set("agent", v.key);
    if (v.runId) q.set("runId", v.runId);
  }
  if (v.kind === "competitor") q.set("competitor", v.id);
  if (v.kind === "panel") q.set("peek", v.id);
  const s = q.toString();
  return s ? `?${s}` : pathname;
}

/** One item, whatever run it shows: a replaced item remounts fresh, a new runId on the same agent doesn't. */
export function peekKey(v: View): string {
  switch (v.kind) {
    case "content":
    case "competitor":
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
      return "Calendar › Post";
    case "doc":
      return "Context › Document";
    case "agent":
      return "Agents";
    case "competitor":
      return "Competitors";
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
 * The Overview's URL without its open item, or null when there's nothing to drop (no item, or not the Overview). A brand
 * switch uses it: the item belongs to the old brand, and the new brand's Overview must not open it.
 */
export function withoutOpenItem(search: string, pathname: string): string | null {
  if (pathname !== "/" || !namesItem(search)) return null;
  return viewToSearch({ kind: "home" }, search, pathname);
}

// The URL dropOpenItem just wrote. The Overview reads it once, on the URL change that write causes, and doesn't ask
// about unsaved work again: the person already agreed in the switcher. Set only on the Overview, where that read follows.
let agreedUrl: string | null = null;

/** After the person agreed to leave (a brand or workspace switch): takes the open item out of the URL. */
export function dropOpenItem() {
  const next = withoutOpenItem(window.location.search, window.location.pathname);
  if (next === null) return;
  agreedUrl = next;
  window.history.replaceState(null, "", next);
}

/** True once when `url` is the one dropOpenItem wrote; always clears it. */
export function agreedToDrop(url: string): boolean {
  const ok = agreedUrl === url;
  agreedUrl = null;
  return ok;
}
