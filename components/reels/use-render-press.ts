"use client";

import { useCallback } from "react";
import type { ReelDetail } from "@/shared";
import { usePlan } from "@/components/shell/use-plan-credits";
import { fetchShared } from "@/components/workspace/use-job";
import { reelUrl, reelsApi } from "./api";
import { pressLabel, usePaidPress } from "./paid-press";
import { renderRefusal, type ReelStep } from "./reel";

/**
 * Make video and Try again: one press, through usePaidPress (paywall with no plan, repeat clicks ignored, off while out
 * and until the reel read after it lands). No requestId and never `again`: the server answers a running render instead of
 * charging twice and refuses a version that already has its video. A success opens the Video step; a 409 reads the reel
 * again (and opens Review when the version already has its video); an unknown outcome is read, never pressed again.
 * `ready`: the plan is read and the server priced the reel (`detail.price` is null while the plan is incomplete).
 */
export function useRenderPress(w: string, b: string, detail: ReelDetail, go: (s: ReelStep) => void) {
  const { loaded, unlimited } = usePlan(w);
  const id = detail.item.id;
  const { version, price } = detail;
  const reread = useCallback(() => fetchShared(reelUrl(w, b, id), true), [w, b, id]);
  const { pressing, error, press: paidPress } = usePaidPress(w, { reread });
  const ready = loaded && price !== null;

  const label = useCallback((text: string) => pressLabel(text, { loaded, unlimited }, price ?? 0), [loaded, unlimited, price]);

  const press = useCallback((e: { detail: number }) => {
    if (!ready) return;
    void (async () => {
      const result = await paidPress(e, () => reelsApi.render(w, b, id, version));
      if (result.ok) return go("video");
      const refusal = renderRefusal(result.error);
      if (!refusal.reread) return;
      await reread().catch(() => undefined);
      if (refusal.review) go("review");
    })();
  }, [ready, paidPress, w, b, id, version, go, reread]);

  return { label, ready, pressing, error, press };
}
