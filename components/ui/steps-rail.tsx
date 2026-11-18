"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Step<T extends string> = { id: T; label: string; state: string; href: string };

function StepList<T extends string>({ steps, current, onPick }: { steps: readonly Step<T>[]; current: T; onPick?: () => void }) {
  return (
    <ol className="space-y-1">
      {steps.map((s, i) => (
        <li key={s.id}>
          <Link
            href={s.href}
            aria-current={s.id === current ? "step" : undefined}
            onClick={onPick}
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              s.id === current ? "bg-accent font-medium text-accent-foreground" : "text-foreground",
            )}
          >
            <span>
              {i + 1}. {s.label}
            </span>
            <span className="text-xs text-muted-foreground">{s.state}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

/**
 * The steps of a flow as links, the current one marked `aria-current="step"` and each step's state as text.
 * From `md` up it is a list; below `md` it is a "Step N of M" button that opens the same list in a sheet.
 * The sheet's list is mounted only once the button has been pressed, so a phone-width page does not carry it twice.
 */
export function StepsRail<T extends string>({ label, steps, current }: { label: string; steps: readonly Step<T>[]; current: T }) {
  const [open, setOpen] = useState(false);
  const index = Math.max(0, steps.findIndex((s) => s.id === current));
  const name = steps[index]?.label ?? "";
  return (
    <>
      <nav aria-label={label} className="hidden md:block">
        <StepList steps={steps} current={current} />
      </nav>
      <div className="md:hidden">
        <Button type="button" variant="outline" className="w-full justify-between" onClick={() => setOpen(true)}>
          <span>
            Step {index + 1} of {steps.length}: {name}
          </span>
          <ChevronDown className="h-4 w-4" aria-hidden />
        </Button>
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto">
            <SheetTitle>{label}</SheetTitle>
            <SheetDescription className="sr-only">Pick a step to go to it.</SheetDescription>
            <nav aria-label={label} className="mt-4">
              <StepList steps={steps} current={current} onPick={() => setOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
