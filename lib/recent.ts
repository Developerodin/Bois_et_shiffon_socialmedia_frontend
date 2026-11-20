import { parseViewParts, type View } from "@/lib/workspace-view";

/** One opened item. `kind` is the URL parameter name (post, doc, agent, competitor); `id` is its value. */
export type RecentEntry = { kind: "post" | "doc" | "agent" | "competitor"; id: string; at: number };

export const RECENT_MAX = 8;
const RECENT_TTL_MS = 30 * 24 * 3600 * 1000;
const PREFIX = "recent:";

/** Per person and brand: what one person opened is not another's business. Null without a user id (no Recent then). */
export const recentKey = (workspaceId: string, brandId: string, userId: string | undefined | null) =>
  userId ? `${PREFIX}${workspaceId}:${brandId}:${userId}` : null;

/** The entry for an open view; null for home. */
export function viewToEntry(v: View, at: number): RecentEntry | null {
  switch (v.kind) {
    case "content":
      return { kind: "post", id: v.id, at };
    case "doc":
      return { kind: "doc", id: v.doc, at };
    case "agent":
      return { kind: "agent", id: v.key, at };
    case "competitor":
      return { kind: "competitor", id: v.id, at };
    case "home":
      return null;
  }
}

/** The view to open for an entry, built from kind and id alone (never `run` or `runId`); home when they don't parse. */
export const entryToView = (e: Pick<RecentEntry, "kind" | "id">): View => parseViewParts(e.kind, e.id);

export const sameItem = (a: Pick<RecentEntry, "kind" | "id">, b: Pick<RecentEntry, "kind" | "id">) => a.kind === b.kind && a.id === b.id;

/** `entry` first, any earlier copy of the same item removed, at most RECENT_MAX kept. */
export const pushRecent = (list: RecentEntry[], entry: RecentEntry): RecentEntry[] => [entry, ...list.filter((e) => !sameItem(e, entry))].slice(0, RECENT_MAX);

/** Strict: what is stored is untrusted (any script on the origin, an older version). Entries are rebuilt, never spread. */
export function parseRecent(raw: unknown, now: number): RecentEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: RecentEntry[] = [];
  for (const r of raw) {
    if (out.length >= RECENT_MAX) break;
    if (!r || typeof r !== "object") continue;
    const { kind, id, at } = r as Record<string, unknown>;
    if (typeof kind !== "string" || typeof id !== "string" || typeof at !== "number" || !Number.isFinite(at)) continue;
    if (at > now + 60_000 || now - at > RECENT_TTL_MS) continue;
    if (parseViewParts(kind, id).kind === "home") continue;
    out.push({ kind: kind as RecentEntry["kind"], id, at });
  }
  return out;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;
const store = (): Store | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

/** Read on menu open and on push only, never in render. */
export function readRecent(key: string, now = Date.now(), s: Store | null = store()): RecentEntry[] {
  try {
    const raw = s?.getItem(key);
    return raw ? parseRecent(JSON.parse(raw), now) : [];
  } catch {
    return [];
  }
}

/** Records an open: skipped when the item is already on top, so reopening the same one writes nothing. */
export function writeRecent(key: string, entry: RecentEntry, now = Date.now(), s: Store | null = store()): void {
  try {
    const list = readRecent(key, now, s);
    if (list[0] && sameItem(list[0], entry)) return;
    s?.setItem(key, JSON.stringify(pushRecent(list, entry)));
  } catch {
    // storage blocked or full: Recent just doesn't remember
  }
}

/**
 * Sign-out: removes every person's history from this browser. ponytail: scans every localStorage key; fine at this
 * size (a few dozen keys), index the keys if the origin ever stores thousands.
 */
export function clearAllRecent(s: Store | null = store()): void {
  try {
    if (!s) return;
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => s.removeItem(k));
  } catch {
    // storage blocked: nothing to clear
  }
}

/** Where typing happens: R there is a letter, and menus and dialogs have their own keys. */
export const R_BLOCKED_TARGET = "input, textarea, select, [contenteditable], [role=textbox], [role=menu], [role=dialog], [role=alertdialog]";

export type RKey = { key: string; defaultPrevented: boolean; repeat: boolean; isComposing: boolean; ctrlKey: boolean; metaKey: boolean; altKey: boolean; inBlockedTarget: boolean };

/** Whether this key press means "reopen the last closed item" (the caller checks that nothing is open and something was closed). */
export const isReopenKey = (e: RKey) =>
  e.key.toLowerCase() === "r" && !e.defaultPrevented && !e.repeat && !e.isComposing && !e.ctrlKey && !e.metaKey && !e.altKey && !e.inBlockedTarget;

/** "3 min ago", "2 h ago", "5 d ago". */
export function ago(at: number, now: number): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
