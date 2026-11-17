import { request } from "@/components/settings/api";

export type Subscription = {
  plan: { id: string; credits: number; renewsAt: string } | null;
  unlimited: boolean;
  plans: { id: string; credits: number }[];
};
export type PlanCredits = { credits: number | null; subscription: Subscription | null; failed: boolean; readAt: number };

const FRESH_MS = 30_000;
const EMPTY: PlanCredits = Object.freeze({ credits: null, subscription: null, failed: false, readAt: 0 });
// Credits belong to the workspace and are shared by all its brands, so the key is the workspace alone.
// Ceiling: entries live for the page's life; a switch of workspace reloads the page, so nothing is evicted.
const state = new Map<string, PlanCredits>();
const inFlight = new Map<string, Promise<void>>();
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

/** Reads credits and plan together; skips when read under 30 s ago unless forced. One read in flight per workspace. Never rejects. */
export function loadPlanCredits(workspaceId: string, force = false): Promise<void> {
  const running = inFlight.get(workspaceId);
  if (running) return running;
  if (!force && Date.now() - planCredits(workspaceId).readAt < FRESH_MS) return Promise.resolve();
  const p = read(workspaceId).finally(() => inFlight.delete(workspaceId));
  inFlight.set(workspaceId, p);
  return p;
}
