import { request } from "@/components/settings/api";

export type Subscription = {
  plan: { id: string; credits: number; renewsAt: string } | null;
  unlimited: boolean;
  plans: { id: string; credits: number }[];
  /** Absent from an old server; no price is shown rather than a guess. */
  prices?: { manualRun: number; siteAudit: number; storyWrite: number; reelPerSecond: number; presenterPerSecond: number };
  freeAgents?: string[];
};
export type PlanCredits = { credits: number | null; subscription: Subscription | null; failed: boolean; readAt: number };

const FRESH_MS = 30_000;
const EMPTY: PlanCredits = Object.freeze({ credits: null, subscription: null, failed: false, readAt: 0 });
// Credits belong to the workspace and are shared by all its brands, so the key is the workspace alone.
// Ceiling: entries live for the page's life; a switch of workspace reloads the page, so nothing is evicted.
const state = new Map<string, PlanCredits>();
const inFlight = new Map<string, Promise<void>>();
/** A forced load that arrived during a read: one follow-up read, shared by every forced call that waits for it. */
const queued = new Map<string, Promise<void>>();
const listeners = new Set<() => void>();

/** The same object until it changes (useSyncExternalStore compares by identity). */
export const planCredits = (workspaceId: string): PlanCredits => state.get(workspaceId) ?? EMPTY;

export function onPlanCredits(fn: () => void): () => void {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

async function read(workspaceId: string): Promise<void> {
  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}`;
  const [credits, subscription] = await Promise.allSettled([
    request<{ credits: number }>(`${base}/credits`),
    request<Subscription>(`${base}/subscription`),
  ]);
  const old = planCredits(workspaceId);
  state.set(workspaceId, {
    credits: credits.status === "fulfilled" ? credits.value.credits : old.credits,
    subscription: subscription.status === "fulfilled" ? subscription.value : old.subscription,
    failed: credits.status === "rejected" || subscription.status === "rejected",
    readAt: Date.now(),
  });
  listeners.forEach((fn) => fn());
}

/**
 * Reads credits and plan together; skips when read under 30 s ago unless forced. One read in flight per workspace. Never rejects.
 * Forced during a read (a paid action just landed), it reads once more after that read, which may predate the charge.
 */
export function loadPlanCredits(workspaceId: string, force = false): Promise<void> {
  const running = inFlight.get(workspaceId);
  if (running && !force) return running;
  if (running) {
    let next = queued.get(workspaceId);
    if (!next) {
      next = running.then(() => {
        queued.delete(workspaceId);
        return loadPlanCredits(workspaceId, true);
      });
      queued.set(workspaceId, next);
    }
    return next;
  }
  if (!force && Date.now() - planCredits(workspaceId).readAt < FRESH_MS) return Promise.resolve();
  const p = read(workspaceId).finally(() => inFlight.delete(workspaceId));
  inFlight.set(workspaceId, p);
  return p;
}

/** Credits a manual run of `agentKey` costs; null (show no price) when the subscription isn't read, the server is too old, or the workspace is unlimited. */
export function agentRunPrice(sub: Subscription | null, agentKey: string): number | null {
  if (!sub || sub.unlimited || !sub.prices) return null;
  return sub.freeAgents?.includes(agentKey) ? 0 : sub.prices.manualRun;
}

const credits = (n: number) => `${n} ${n === 1 ? "credit" : "credits"}`;

/** "Run now · 5 credits": the visible words first, so the accessible name still starts with them. A free or unknown price adds nothing. */
export const withPrice = (label: string, price: number | null): string => (price ? `${label} · ${credits(price)}` : label);

export function creditsLabel(balance: number | null, unlimited: boolean): string {
  if (unlimited) return "Unlimited credits";
  return balance === null ? "Credits" : credits(balance);
}

/** The workspace id in a `/api/v1/workspaces/<w>/brands/<b>` base, for callers that only hold the base. */
export function workspaceIdOf(base: string): string | null {
  const m = /\/workspaces\/([^/]+)/.exec(base);
  return m ? decodeURIComponent(m[1]) : null;
}
