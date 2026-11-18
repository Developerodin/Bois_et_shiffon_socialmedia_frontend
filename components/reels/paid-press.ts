"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PRESS_COOLDOWN_MS } from "@/components/photoshoot/press";
import { usePlan } from "@/components/shell/use-plan-credits";
import { loadPlanCredits, withPrice } from "@/lib/plan-credits";
import { openPaywall } from "@/lib/paywall";
import { isRepeatClick, pressErrorText, refused } from "@/lib/presser";
import { PLAN_REFUSAL } from "./labels";

/** A paid button's words: "Reading prices…" until the plan is read, then the label with its price (none on an unlimited plan). */
export const pressLabel = (label: string, plan: { loaded: boolean; unlimited: boolean }, credits: number): string =>
  plan.loaded ? withPrice(label, plan.unlimited ? null : credits) : "Reading prices…";

/** Waits (ms) before each retry of a failed read; after the last the button stays off, since a press may have started. */
export const REREAD_RETRY_MS = [2_000, 5_000, 15_000] as const;
/** The wait before retry number `attempt` (0 = after the first failed read); null once they are used up. */
export const rereadDelay = (attempt: number): number | null => REREAD_RETRY_MS[attempt] ?? null;
const UNREAD = "Couldn't check whether that went through. Reload the page to see.";

export type PressResult = { ok: true; value: unknown } | { ok: false; error: unknown };

/**
 * Every paid reel button (Make a presenter, Preview with my photos, Clone voice) goes through this one hook:
 * no plan opens the paywall and sends nothing; a repeat click or a press while one is out is ignored; the balance is read
 * again after any answer; an answer that may still have charged (not a refusal) reads `reread` and keeps the button off
 * until it lands; a success does the same, then waits out the cooldown, so the button can't come back before the new
 * RUNNING row is seen. `error` is the sentence to show (null when the paywall said it); the clone also gets the raw
 * error from `press`. An ignored press resolves `{ ok: false, error: null }`.
 */
export function usePaidPress(w: string, opts: { reread: () => Promise<unknown> }) {
  const { loaded, planned } = usePlan(w);
  const [pressing, setPressing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const alive = useRef(true);
  const reread = useRef(opts.reread);
  reread.current = opts.reread;
  const locked = loaded && !planned;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const press = useCallback(
    async (e: { detail: number }, run: () => Promise<unknown>): Promise<PressResult> => {
      if (isRepeatClick(e) || busy.current) return { ok: false, error: null };
      if (locked) {
        openPaywall(PLAN_REFUSAL);
        return { ok: false, error: null };
      }
      busy.current = true;
      setPressing(true);
      setError(null);
      let result: PressResult;
      try {
        result = { ok: true, value: await run() };
      } catch (err) {
        result = { ok: false, error: err };
      }
      void loadPlanCredits(w, true);
      if (!result.ok && alive.current) setError(pressErrorText(result.error));
      const release = () => {
        busy.current = false;
        if (alive.current) setPressing(false);
      };
      // Held until the read lands: a refusal charged nothing, so it frees the button at once. A read that fails (offline,
      // a gateway page) is tried again after REREAD_RETRY_MS; if none lands the button stays off (see rereadDelay).
      if (result.ok || !refused(result.error)) {
        const cooldown = result.ok;
        void (async () => {
          for (let attempt = 0; ; attempt++) {
            try {
              await reread.current();
              break;
            } catch {
              const delay = rereadDelay(attempt);
              if (delay === null || !alive.current) {
                if (alive.current) setError(UNREAD);
                return;
              }
              await new Promise((r) => setTimeout(r, delay));
              if (!alive.current) return;
            }
          }
          if (cooldown) setTimeout(release, PRESS_COOLDOWN_MS);
          else release();
        })();
      } else release();
      return result;
    },
    [w, locked],
  );

  return { pressing, error, press };
}
