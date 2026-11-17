import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { TONE_CLASS, toneOf, type Tone } from "@/lib/status";

/** A status pill. Pass the enum as `status`, or an explicit `tone` for derived states. Labels stay with callers. */
export function StatusBadge({ status, tone, className, children }: { status?: string | null; tone?: Tone; className?: string; children: ReactNode }) {
  const t = tone ?? toneOf(status);
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium", TONE_CLASS[t], className)}>
      {children}
    </span>
  );
}
