"use client";

import { Coins } from "lucide-react";
import { SHELL_STROKE, tool } from "@/components/shell/icon";
import { useCredits, usePlan } from "@/components/shell/use-plan-credits";
import { Button } from "@/components/ui/button";
import { creditsLabel } from "@/lib/plan-credits";
import { cn } from "@/lib/utils";

/** The balance popover: the top bar's overflow menu opens it too, where the chip is hidden. */
export const CREDITS_POPOVER_ID = "credits-popover";
const POPOVER_ID = CREDITS_POPOVER_ID;

/** The workspace's balance in the top bar; its native popover (light dismiss and Escape for free) says what the credits are. */
/** `className` goes on the chip only: hiding it keeps the popover, so the overflow menu can still open it. */
export function CreditsChip({ workspaceId, className }: { workspaceId: string; className?: string }) {
  const { credits, failed, reload } = useCredits(workspaceId);
  const { plan, unlimited } = usePlan(workspaceId);
  const label = creditsLabel(credits, unlimited);
  // "120 credits" shows as "120" below sm; a bare "Credits" stays whole.
  const cut = label.lastIndexOf(" ");
  return (
    <>
      <button type="button" popoverTarget={POPOVER_ID} className={cn(tool, className)}>
        <Coins className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
        {cut < 0 ? (
          label
        ) : (
          <span className="tabular-nums">
            {label.slice(0, cut)}
            <span className="max-sm:sr-only">{label.slice(cut)}</span>
          </span>
        )}
      </button>
      <div id={POPOVER_ID} popover="auto" className="fixed inset-auto right-4 top-[76px] m-0 w-72 rounded-2xl border border-border bg-popover p-4 text-sm shadow-lg">
        <p className="text-lg font-medium tabular-nums text-popover-foreground">{label}</p>
        <p className="mt-1 text-muted-foreground">Shared by every business in this workspace.</p>
        <p className="mt-3 text-popover-foreground">
          {unlimited
            ? "Unlimited (test workspace)"
            : plan
              ? `${plan.id} plan, renews ${new Date(plan.renewsAt).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
              : "No plan yet. Plans aren't on sale yet."}
        </p>
        {failed && (
          <div className="mt-3 flex items-center justify-between gap-3">
            <p role="alert" className="text-destructive">Couldn&apos;t read the balance.</p>
            <Button variant="outline" size="sm" onClick={() => void reload()}>
              Try again
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
