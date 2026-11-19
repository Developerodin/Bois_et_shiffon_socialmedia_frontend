"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { PlanResult, ReelDetail, ReelPlan } from "@/shared";
import { ApiError, errorMessage } from "@/components/settings/api";
import { fetchShared, putShared, sharedResponse } from "@/components/workspace/use-job";
import { reelUrl, reelsApi } from "./api";
import { CHANGED_ELSEWHERE } from "./plan-stream";

/** The server's code for a save refused because the plan moved on. */
export const REEL_CHANGED = "reel.changed";

/** The server's code for a caption save refused because the draft moved on. */
export const DRAFT_CHANGED = "draft.changed";

/** What to show for a failed save; only reel.changed or draft.changed (it moved on) gets the keep-your-text sentence. */
export const saveErrorText = (e: unknown): string =>
  e instanceof ApiError && (e.code === REEL_CHANGED || e.code === DRAFT_CHANGED) ? CHANGED_ELSEWHERE : errorMessage(e);

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
  // The last failure: its sentence, and the server's code (so callers needn't compare the sentence).
  const [failure, setFailure] = useState<{ text: string; code: string | null } | null>(null);
  const busy = useRef(false);

  const save = useCallback(async (version: number, plan: ReelPlan): Promise<PlanResult | null> => {
    if (busy.current) return null;
    busy.current = true;
    setSaving(true);
    setFailure(null);
    const url = reelUrl(w, b, reelId);
    const reread = () => fetchShared(url, true).catch(() => undefined);
    try {
      const out = await reelsApi.save(w, b, reelId, { version, plan });
      const shown = sharedResponse(url) as ReelDetail | undefined;
      if (shown) putShared(url, { ...shown, version: out.version, plan: out.plan });
      await reread();
      return out;
    } catch (e) {
      setFailure({ text: saveErrorText(e), code: e instanceof ApiError ? (e.code ?? null) : null });
      if (e instanceof ApiError && (e.status === 409 || e.status === 0)) await reread();
      return null;
    } finally {
      busy.current = false;
      setSaving(false);
    }
  }, [w, b, reelId]);

  const clear = useCallback(() => setFailure(null), []);

  // Stable between renders unless saving/error change, so memoised steps given it don't re-render on every stream frame.
  const error = failure?.text ?? null;
  const errorCode = failure?.code ?? null;
  return useMemo(() => ({ saving, error, errorCode, save, clear }), [saving, error, errorCode, save, clear]);
}

export type ReelSave = ReturnType<typeof useReelSave>;
