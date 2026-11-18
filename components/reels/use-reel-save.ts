"use client";

import { useCallback, useRef, useState } from "react";
import type { PlanResult, ReelDetail, ReelPlan } from "@/shared";
import { ApiError, errorMessage } from "@/components/settings/api";
import { fetchShared, putShared, sharedResponse } from "@/components/workspace/use-job";
import { reelUrl, reelsApi } from "./api";
import { CHANGED_ELSEWHERE } from "./plan-stream";

/** What to show for a failed save; only reel.changed (the plan moved on) gets the keep-your-text sentence. */
export const saveErrorText = (e: unknown): string =>
  e instanceof ApiError && e.code === "reel.changed" ? CHANGED_ELSEWHERE : errorMessage(e);

/**
 * Saves the plan, one save at a time. Held once by the reel page and passed down, so every step and dialog shares one
 * lock. Callers pass the version their edit started from, never the current one: a plan that moved meanwhile gets the
 * server's 409 and the person's edit stays. On success the saved plan is shown at once, then the reel is read again;
 * the lock is released only after that read. After a 409, or no answer (a timed-out save may still commit), the reel is
 * read again too. Never touches the caller's edits.
 * ponytail: the lock is per page; a second tab or device is what the 409 is for.
 */
export function useReelSave(w: string, b: string, reelId: string) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const save = useCallback(async (version: number, plan: ReelPlan): Promise<PlanResult | null> => {
    if (busy.current) return null;
    busy.current = true;
    setSaving(true);
    setError(null);
    const url = reelUrl(w, b, reelId);
    const reread = () => fetchShared(url, true).catch(() => undefined);
    try {
      const out = await reelsApi.save(w, b, reelId, { version, plan });
      const shown = sharedResponse(url) as ReelDetail | undefined;
      if (shown) putShared(url, { ...shown, version: out.version, plan: out.plan });
      await reread();
      return out;
    } catch (e) {
      setError(saveErrorText(e));
      if (e instanceof ApiError && (e.status === 409 || e.status === 0)) await reread();
      return null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [w, b, reelId]);

  const clear = useCallback(() => setError(null), []);

  return { saving, error, save, clear };
}

export type ReelSave = ReturnType<typeof useReelSave>;
