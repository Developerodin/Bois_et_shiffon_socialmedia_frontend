"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Circle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type JobStep = { label: string; state: "done" | "active" | "waiting" | "failed" };

const STATE_TEXT: Record<JobStep["state"], string> = { done: "Done", active: "In progress", waiting: "Waiting", failed: "Failed" };

/** Where the job is: the failed step, else the active one (else the first waiting one), and whether every step is done. */
function position(steps: readonly JobStep[]) {
  const failed = steps.findIndex((s) => s.state === "failed");
  const active = steps.findIndex((s) => s.state === "active");
  return { failed, current: active >= 0 ? active : steps.findIndex((s) => s.state === "waiting"), allDone: steps.every((s) => s.state === "done") };
}

/** The progress bar's `aria-valuetext`. */
export function progressText(steps: readonly JobStep[], value: number | null): string {
  const { failed, current, allDone } = position(steps);
  if (failed >= 0) return `Failed: ${steps[failed].label}`;
  if (allDone) return "Done";
  const text = `Step ${current + 1} of ${steps.length}, ${steps[current].label}`;
  return value === null ? text : `${text}, ${Math.round(value)} %`;
}

/** What a screen reader should hear when the steps change: null on mount and while the step, failure and done-ness are the same. */
export function stepAnnouncement(prev: readonly JobStep[] | null, next: readonly JobStep[]): string | null {
  if (!prev) return null;
  const a = position(prev);
  const b = position(next);
  return a.current === b.current && a.failed === b.failed && a.allDone === b.allDone ? null : progressText(next, null);
}

function StepIcon({ state }: { state: JobStep["state"] }) {
  const cls = "size-4 shrink-0";
  if (state === "done") return <Check aria-hidden className={cn(cls, "text-success-ink")} />;
  if (state === "failed") return <X aria-hidden className={cn(cls, "text-destructive")} />;
  if (state === "active") return <Loader2 aria-hidden className={cn(cls, "animate-spin text-primary motion-reduce:animate-none")} />;
  return <Circle aria-hidden className={cn(cls, "text-muted-foreground")} />;
}

/** A job's steps with their state, a progress bar, a polite announcement per step, and keep waiting / retry when slow. Feed `job` from `useJob`. */
export function JobProgress({ title, steps, value = null, job, onRetry }: {
  title: string;
  steps: JobStep[];
  value?: number | null;
  job: { slow: boolean; failed: boolean; reload: () => Promise<void> };
  onRetry?: () => void;
}) {
  const prev = useRef<readonly JobStep[] | null>(null);
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    const text = stepAnnouncement(prev.current, steps);
    prev.current = steps;
    if (text) setAnnouncement(text);
  }, [steps]);

  // "Keep waiting" hides the notice until `slow` turns off and on again.
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!job.slow) setDismissed(false);
  }, [job.slow]);

  return (
    <section aria-label={title} className="rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
      <h3 className="text-lg font-semibold">{title}</h3>
      <div
        role="progressbar"
        aria-label={title}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value === null ? undefined : Math.round(value)}
        aria-valuetext={progressText(steps, value)}
        className="mt-3 h-2 overflow-hidden rounded-full bg-border"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] motion-reduce:transition-none"
          style={{ width: `${value === null ? 0 : Math.min(100, Math.max(0, value))}%` }}
        />
      </div>
      <ol className="mt-3 space-y-2">
        {steps.map((s) => (
          <li key={s.label} className="flex items-center gap-2 text-sm">
            <StepIcon state={s.state} />
            <span className="flex-1">{s.label}</span>
            <span className="text-xs text-muted-foreground">{STATE_TEXT[s.state]}</span>
          </li>
        ))}
      </ol>
      <p aria-live="polite" className="sr-only">{announcement}</p>
      {job.slow && !dismissed && (
        <div role="status" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <span>This is taking longer than usual.</span>
          <Button size="sm" variant="ghost" onClick={() => setDismissed(true)}>Keep waiting</Button>
          <Button size="sm" variant="outline" onClick={onRetry ?? (() => void job.reload())}>{onRetry ? "Retry" : "Check now"}</Button>
        </div>
      )}
      {job.failed && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-destructive">
          <span>Couldn&apos;t check progress.</span>
          <Button size="sm" variant="outline" onClick={() => void job.reload()}>Try again</Button>
        </div>
      )}
    </section>
  );
}
