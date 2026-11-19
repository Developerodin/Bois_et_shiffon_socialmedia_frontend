import { Check, TriangleAlert } from "lucide-react";
import type { CheckResult } from "@/shared";
import { cn } from "@/lib/utils";

/** A quality check's results: each line's check and note, its status as an icon with an `aria-label` (Pass, Warning, Blocker). */
export function ChecksList({ results }: { results: readonly CheckResult[] }) {
  return (
    <ul className="mt-3 flex flex-col gap-2 text-sm">
      {results.map((r, i) => (
        <li key={i} className="flex gap-2">
          {r.status === "pass" ? (
            <Check className="mt-0.5 size-4 shrink-0 text-success" aria-label="Pass" />
          ) : (
            <TriangleAlert className={cn("mt-0.5 size-4 shrink-0", r.status === "blocker" ? "text-destructive" : "text-warning")} aria-label={r.status === "blocker" ? "Blocker" : "Warning"} />
          )}
          <span>
            <span className="font-medium">{r.check}: </span>
            <span className="text-muted-foreground">{r.note}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
