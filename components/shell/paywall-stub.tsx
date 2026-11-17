"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { closePaywall, currentPaywall, onPaywallChange } from "@/lib/paywall";
import { loadPlanCredits } from "@/lib/plan-credits";

/** Slice 0b's placeholder: says why the action was refused. Slice 0c replaces it with PaywallDialog. */
export function PaywallStub({ workspaceId }: { workspaceId: string | null }) {
  const refusal = useSyncExternalStore(onPaywallChange, currentPaywall, () => null);
  // Once per opening: the balance may have moved since the last read.
  useEffect(() => {
    if (refusal && workspaceId) void loadPlanCredits(workspaceId, true);
  }, [refusal, workspaceId]);
  if (!refusal) return null;
  return (
    <Dialog open onOpenChange={(o) => !o && closePaywall()}>
      <DialogContent>
        {"insufficientCredits" in refusal ? (
          <>
            <DialogTitle>Not enough credits</DialogTitle>
            <DialogDescription>{`This needs ${refusal.needed} credits. The workspace has ${refusal.balance}.`}</DialogDescription>
          </>
        ) : (
          <>
            <DialogTitle>{refusal.title}</DialogTitle>
            <DialogDescription>Plans aren&apos;t on sale yet. Ask us to turn one on for this workspace.</DialogDescription>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
