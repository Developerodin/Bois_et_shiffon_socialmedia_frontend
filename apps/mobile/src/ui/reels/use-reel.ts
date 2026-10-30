import { useCallback, useEffect, useRef, useState } from "react";
import { type PlanResult, type ReelDetail, type ReelPlan, reels } from "@/api/endpoints";

/**
 * The reel the Reels screens are working on (R04 → R10–R13 → R03 → R05 → R07 → R08), shared across screens
 * without route params. ponytail: module state; a reel id in the route would survive a cold start too.
 */
let currentId: string | null = null;
export const openReel = (id: string | null) => void (currentId = id);
export const reelId = () => currentId;

/** Loads the current reel; poll > 0 refreshes it (R05 progress, R07 checks). */
export function useReel(poll = 0) {
  const [detail, setDetail] = useState<ReelDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const live = useRef(true);

  const load = useCallback(async () => {
    if (!currentId) return;
    try {
      const d = await reels.get(currentId);
      if (live.current) {
        setDetail(d);
        setError(null);
      }
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    live.current = true;
    // State is only set in the fetch's callbacks, after the effect has run.
    const tick = () => {
      if (!currentId) return;
      reels.get(currentId).then(
        (d) => live.current && (setDetail(d), setError(null)),
        (e: unknown) => live.current && setError(e instanceof Error ? e.message : String(e)),
      );
    };
    tick();
    const timer = poll > 0 ? setInterval(tick, poll) : undefined;
    return () => {
      live.current = false;
      if (timer) clearInterval(timer);
    };
  }, [poll]);

  /** Runs a change that returns a new plan version, then reloads. Errors land in `error`. */
  const change = useCallback(async (run: () => Promise<PlanResult | unknown>) => {
    setBusy(true);
    setError(null);
    try {
      const r = await run();
      await load();
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      if (live.current) setBusy(false);
    }
  }, [load]);

  const save = (plan: ReelPlan) => change(() => reels.save(currentId!, detail!.version, plan));
  const chat = async (message: string) => {
    if (!currentId) {
      const r = await change(() => reels.create({ prompt: message }));
      if (r && typeof r === "object" && "id" in r) {
        currentId = (r as { id: string }).id;
        await load();
      }
      return r;
    }
    return change(() => reels.chat(currentId!, detail?.version ?? 0, message));
  };
  return { id: currentId, detail, error, busy, load, save, chat, setError };
}
