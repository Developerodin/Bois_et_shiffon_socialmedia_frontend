import { Check, ChevronRight, TriangleAlert } from "lucide-react";
import type { CheckResult } from "@/shared";
import { TONE_CLASS, type Tone } from "@/lib/status";
import { cn } from "@/lib/utils";

const OVERALL: Record<"PASS" | "WARN" | "BLOCKER", { text: string; tone: Tone }> = {
  PASS: { text: "Passed", tone: "good" },
  WARN: { text: "Passed with notes", tone: "warn" },
  BLOCKER: { text: "Needs fixes", tone: "bad" },
};
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * A draft's quality check in the post inspector: the overall result, how many checks passed and the warnings and
 * blockers, then each check as a row that opens to its note. Warnings and blockers start open and are tinted; passes
 * start closed. Every check's text stays in the page.
 */
export function QualityCheck({ check }: { check: { overall: "PASS" | "WARN" | "BLOCKER"; results: readonly CheckResult[] } }) {
  const { results } = check;
  const passed = results.filter((r) => r.status === "pass").length;
  const warnings = results.filter((r) => r.status === "warn").length;
  const blockers = results.filter((r) => r.status === "blocker").length;
  const overall = OVERALL[check.overall];
  return (
    <section aria-labelledby="qc-h" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h2 id="qc-h" className="text-sm font-semibold">Content quality</h2>
        <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", TONE_CLASS[overall.tone])}>{overall.text}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {passed} of {results.length} checks passed
        {warnings > 0 && <> · <span className="font-medium text-warning-ink">{plural(warnings, "warning")}</span></>}
        {blockers > 0 && <> · <span className="font-medium text-destructive">{plural(blockers, "blocker")}</span></>}
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {results.map((r, i) => {
          const pass = r.status === "pass";
          return (
            <li key={i}>
              <details open={!pass} className={cn("group rounded-md", !pass && (r.status === "blocker" ? "bg-destructive/5" : "bg-warning/10"))}>
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
                  {pass ? (
                    <Check className="size-4 shrink-0 text-success" aria-label="Pass" />
                  ) : (
                    <TriangleAlert className={cn("size-4 shrink-0", r.status === "blocker" ? "text-destructive" : "text-warning-ink")} aria-label={r.status === "blocker" ? "Blocker" : "Warning"} />
                  )}
                  <span className={cn("min-w-0 flex-1", !pass && "font-medium")}>{r.check}</span>
                  <ChevronRight aria-hidden className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90 motion-reduce:transition-none" />
                </summary>
                <p className="pb-2 pl-8 pr-2 text-muted-foreground">{r.note}</p>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
