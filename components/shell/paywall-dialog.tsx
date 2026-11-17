"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { closePaywall, currentPaywall, onPaywallChange } from "@/lib/paywall";
import { loadPlanCredits } from "@/lib/plan-credits";
import type { PaywallRefusal } from "@/shared";

/** What the dialog says for each refusal. No purchase path: plans aren't on sale yet. */
export function paywallCopy(r: PaywallRefusal): { title: string; body: string } {
  if ("insufficientCredits" in r) {
    const needed = `${r.needed} ${r.needed === 1 ? "credit" : "credits"}`;
    return {
      title: "Not enough credits",
      body: `This needs ${needed}. The workspace has ${r.balance}. Credits are shared by every business in this workspace.`,
    };
  }
  return { title: r.title, body: "Plans aren't on sale yet. Ask us to turn one on for this workspace." };
}

/** Says why the server refused a paid action (any recognisable 402 opens it via the paywall store). */
export function PaywallDialog({ workspaceId }: { workspaceId: string | null }) {
  const refusal = useSyncExternalStore(onPaywallChange, currentPaywall, () => null);
  // Once per opening: the balance may have moved since the last read.
  useEffect(() => {
    if (refusal && workspaceId) void loadPlanCredits(workspaceId, true);
  }, [refusal, workspaceId]);
  if (!refusal) return null;
  const { title, body } = paywallCopy(refusal);
  return (
    <Dialog open onOpenChange={(o) => !o && closePaywall()}>
      <DialogContent>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{body}</DialogDescription>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Close</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
