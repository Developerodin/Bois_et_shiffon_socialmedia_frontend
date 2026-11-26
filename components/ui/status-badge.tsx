import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_CLASS, TONE_DOT, toneOf, type Tone } from "@/lib/status";

/**
 * A status pill. Pass the enum as `status`, or an explicit `tone` for derived states. Labels stay with callers.
 * `quiet`: a neutral pill (card surface, hairline border, ink text) with a small dot in the status hue, for screens that
 * keep colour to a marker (the content calendar).
 */
export function StatusBadge({ status, tone, quiet, className, children }: { status?: string | null; tone?: Tone; quiet?: boolean; className?: string; children: ReactNode }) {
  const t = tone ?? toneOf(status);
  if (quiet) {
    return (
      <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-foreground", className)}>
        <span aria-hidden="true" className={cn("size-1.5 shrink-0 rounded-full", TONE_DOT[t])} />
        {children}
      </span>
    );
  }
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[t], className)}>
      {children}
    </span>
  );
}
