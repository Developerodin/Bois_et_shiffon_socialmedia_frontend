// The order the person put the sidebar's agents in. Stored as ids only; unknown ids are dropped and agents
// missing from the saved list (new ones) keep their default place at the end.
// ponytail: per browser (localStorage), not synced across devices; move to a user setting if people ask for that.
export const AGENT_ORDER_KEY = "nav.agentOrder.v1";

export function applyOrder<T extends { id: string }>(items: readonly T[], saved: readonly string[] | null): T[] {
  if (!saved) return [...items];
  const rank = new Map(saved.map((id, i) => [id, i]));
  return [...items].sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
}

/** Moves the item at `from` to `to`, returning a new array; out-of-range indexes leave it unchanged. */
export function move<T>(list: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length || to >= list.length) return [...list];
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export function parseOrder(raw: string | null): string[] | null {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(v) && v.every((x) => typeof x === "string") ? v.slice(0, 50) : null;
  } catch {
    return null;
  }
}
