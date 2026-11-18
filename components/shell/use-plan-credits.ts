"use client";

import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ShootTier } from "@/shared";
import { agentRunPrice, loadPlanCredits, onPlanCredits, planCredits, shootPrice, type PlanCredits } from "@/lib/plan-credits";

const EMPTY: PlanCredits = planCredits("");

/** The workspace's store entry; loads on mount and when the window regains focus (a no-op within 30 s). */
function useEntry(workspaceId: string | null) {
  const entry = useSyncExternalStore(
    onPlanCredits,
    () => (workspaceId ? planCredits(workspaceId) : EMPTY),
    () => EMPTY,
  );
  useEffect(() => {
    if (!workspaceId) return;
    const load = () => void loadPlanCredits(workspaceId);
    load();
    window.addEventListener("focus", load);
    return () => window.removeEventListener("focus", load);
  }, [workspaceId]);
  const reload = useCallback(() => (workspaceId ? loadPlanCredits(workspaceId, true) : Promise.resolve()), [workspaceId]);
  return { entry, reload };
}

export function useCredits(workspaceId: string | null) {
  const { entry, reload } = useEntry(workspaceId);
  return { credits: entry.credits, failed: entry.failed, reload };
}

export function usePlan(workspaceId: string | null) {
  const { entry, reload } = useEntry(workspaceId);
  const sub = entry.subscription;
  return {
    loaded: sub !== null,
    planned: sub !== null && (sub.plan !== null || sub.unlimited),
    plan: sub?.plan ?? null,
    unlimited: sub?.unlimited ?? false,
    failed: entry.failed,
    reload,
  };
}

/** Credits a manual run of `agentKey` costs in this workspace; null means show no price. */
export function useRunPrice(workspaceId: string | null, agentKey: string): number | null {
  return agentRunPrice(useEntry(workspaceId).entry.subscription, agentKey);
}

/** What a new photoshoot on each tier costs in this workspace; null means show no price. */
export function useShootPrices(workspaceId: string | null): (tier: ShootTier) => number | null {
  const sub = useEntry(workspaceId).entry.subscription;
  return useCallback((tier: ShootTier) => shootPrice(sub, tier), [sub]);
}
