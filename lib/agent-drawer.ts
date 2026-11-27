import type { AgentEvent, AgentEventLevel } from "@/components/agents/api";

/**
 * The posts a run worked on, each once, newest first, with its latest line in that run: what the drawer's Outputs list
 * under "Latest run". Only ContentItem entities (the only kind the app can open).
 */
export function runPosts(events: readonly AgentEvent[]): { id: string; line: string }[] {
  const seen = new Map<string, string>();
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i]!;
    if (e.entityType === "ContentItem" && e.entityId && !seen.has(e.entityId)) seen.set(e.entityId, e.message);
  }
  return [...seen].map(([id, line]) => ({ id, line }));
}

type BriefPost = { channel: string; scheduledFor: string | null; brief: Record<string, unknown> | null };

/** The product names a post's brief carries (the Brief writer saves them as `products`); none when absent or malformed. */
export function briefProducts(brief: Record<string, unknown> | null | undefined): string[] {
  const p = brief?.products;
  return Array.isArray(p) ? p.filter((x): x is string => typeof x === "string" && x.trim() !== "") : [];
}

/**
 * The Planner's latest run in numbers, from the posts it planned that the list could read: posts, distinct channels,
 * distinct products (only from briefs that name them; null when none does, never a guessed 0) and the date range
 * (null when no post has a date).
 */
export function plannerSummary(posts: readonly BriefPost[]) {
  const channels = [...new Set(posts.map((p) => p.channel))];
  const named = posts.flatMap((p) => briefProducts(p.brief));
  const dates = posts.map((p) => p.scheduledFor).filter((d): d is string => !!d).sort();
  return {
    posts: posts.length,
    channels,
    products: named.length ? new Set(named).size : null,
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };
}

/** Groups posts by a key, keeping first-seen order of the groups and the posts in each. */
export function groupBy<T>(items: readonly T[], key: (x: T) => string): { key: string; items: T[] }[] {
  const out = new Map<string, T[]>();
  for (const x of items) {
    const k = key(x);
    const list = out.get(k);
    if (list) list.push(x);
    else out.set(k, [x]);
  }
  return [...out].map(([k, v]) => ({ key: k, items: v }));
}

/** One labelled line of a brief, in the order the drawer shows them. */
export type BriefField = { key: string; label: string; value: string | string[] };

const BRIEF_FIELDS: readonly (readonly [string, string])[] = [
  ["goal", "Objective"],
  ["angle", "Angle"],
  ["audience", "Audience"],
  ["keyMessage", "Key message"],
  ["products", "Products"],
  ["cta", "Call to action"],
  ["visual", "Visual direction"],
  ["questions", "Open questions"],
];

/**
 * A post's brief as labelled fields, read defensively: the brief is free JSON (the Planner writes only `angle`, the
 * Brief writer adds the rest, hand-made posts differ), so only non-empty strings and string lists are shown and unknown
 * keys are left out. Never the raw JSON.
 */
export function briefFields(brief: Record<string, unknown> | null | undefined): BriefField[] {
  if (!brief) return [];
  const out: BriefField[] = [];
  for (const [key, label] of BRIEF_FIELDS) {
    const v = brief[key];
    if (typeof v === "string" && v.trim()) out.push({ key, label, value: key === "goal" ? v.charAt(0).toUpperCase() + v.slice(1) : v.trim() });
    else if (Array.isArray(v)) {
      const list = v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
      if (list.length) out.push({ key, label, value: list });
    }
  }
  return out;
}

/** Whether a post carries a written brief (more than the Planner's angle). */
export const hasBrief = (brief: Record<string, unknown> | null | undefined) => briefFields(brief).some((f) => f.key !== "angle");

/** Events per level, for the log's filter chips. */
export function levelCounts(events: readonly AgentEvent[]): Record<AgentEventLevel, number> {
  const c: Record<AgentEventLevel, number> = { INFO: 0, SUCCESS: 0, WARN: 0, ERROR: 0 };
  for (const e of events) c[e.level] = (c[e.level] ?? 0) + 1;
  return c;
}

/** The log as plain text for Copy: one line per event (ISO time, level, agent, message, entity). */
export function logText(events: readonly AgentEvent[]): string {
  return events.map((e) => `${e.createdAt} ${e.level} [${e.agentKey}] ${e.message}${e.entityType ? ` -> ${e.entityType}${e.entityId ? ` ${e.entityId}` : ""}` : ""}`).join("\n");
}

/** The milestones of a run for the readable timeline: every warning, error and success line (INFO stays in the log). */
export const milestones = (events: readonly AgentEvent[]) => events.filter((e) => e.level !== "INFO");
