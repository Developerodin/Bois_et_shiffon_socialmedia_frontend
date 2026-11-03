import * as SecureStore from "expo-secure-store";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useSyncExternalStore } from "react";
import { Platform } from "react-native";
import { ApiError } from "@/api/client";
import { currentBrand, subscription, type Subscription } from "@/api/endpoints";

/**
 * The current workspace's plan (apps/web subscriptions.ts), shared by every screen and read again on focus (at most
 * every FRESH_MS). `planned`: it has an active plan (or is an unlimited testing workspace): making videos and
 * generating the calendar work. Null until the first read.
 */
type State = Subscription & { workspaceId: string; readAt: number };
const FRESH_MS = 30_000;
let state: State | null = null;
let inflight: Promise<void> | null = null;
/** The last read failed (nothing is known about the plan): screens can say so and offer a retry. */
let failed = false;
const setFailed = (f: boolean) => {
  if (failed === f) return;
  failed = f;
  listeners.forEach((l) => l());
};
const listeners = new Set<() => void>();
const set = (s: State | null) => {
  state = s;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const same = (a: Subscription | null, b: Subscription) => !!a && a.unlimited === b.unlimited && a.plan?.id === b.plan?.id && a.plan?.renewsAt === b.plan?.renewsAt;

/** Reads the plan (one request at a time); an answer for a workspace the app has switched away from is dropped. */
export function reloadPlan(force = false) {
  if (!force && state && Date.now() - state.readAt < FRESH_MS) return Promise.resolve();
  inflight ??= subscription()
    .then(async (s) => {
      if ((await currentBrand()).workspaceId !== s.workspaceId) return;
      setFailed(false);
      if (same(state, s)) state = { ...state!, readAt: Date.now() };
      else set({ ...s, readAt: Date.now() });
      void showActivationOnce(s);
    }, () => setFailed(true))
    .finally(() => void (inflight = null));
  return inflight;
}
/** Switching business or signing out: the next screen reads the new workspace's plan. */
export const forgetPlan = () => (setFailed(false), set(null));

export function usePlan() {
  const s = useSyncExternalStore(subscribe, () => state);
  const failedRead = useSyncExternalStore(subscribe, () => failed);
  useFocusEffect(useCallback(() => void reloadPlan(), []));
  return { loaded: s !== null, failed: failedRead && s === null, reload: () => reloadPlan(true), planned: !!s && (!!s.plan || s.unlimited), plan: s?.plan ?? null, unlimited: !!s?.unlimited, plans: s?.plans ?? [] };
}

/** A paid action refused for lack of a plan (402 with planRequired, as opposed to not enough credits). */
export const isPlanRequired = (e: unknown) => e instanceof ApiError && e.status === 402 && !!(e.data as { planRequired?: boolean } | undefined)?.planRequired;

/**
 * L04 "Your plan is active", once when this phone sees a workspace go from no plan (or another plan) to a plan; there's
 * no store purchase to return from yet (an admin turns plans on). Each read records the workspace's state, plan or
 * none, so the change is noticed the next time any screen reads it. ponytail: remembered per phone.
 */
async function showActivationOnce(s: Subscription & { workspaceId: string }) {
  if (Platform.OS === "web") return;
  const key = `espanda.seenPlan.${s.workspaceId}`;
  const now = s.plan?.id ?? "none";
  const seen = await SecureStore.getItemAsync(key).catch(() => null);
  if (seen === now) return;
  await SecureStore.setItemAsync(key, now).catch(() => {});
  // Only a change this phone saw (not the first look at a workspace that already had its plan).
  if (s.plan && seen !== null) router.push("/plans/activated");
}
