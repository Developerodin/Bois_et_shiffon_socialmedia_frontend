import type { ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { changeLabel, fmt, type Comparison } from "@/lib/analytics-channels";
import { cn } from "@/lib/utils";

/** Columns at the widest, by how many figures there are (static class names, for Tailwind). */
const WIDE: Record<number, string> = {
  1: "",
  2: "@min-[36rem]/metrics:grid-cols-2",
  3: "@min-[36rem]/metrics:grid-cols-3",
  4: "@min-[36rem]/metrics:grid-cols-2 @min-[52rem]/metrics:grid-cols-4",
  5: "@min-[36rem]/metrics:grid-cols-3 @min-[60rem]/metrics:grid-cols-5",
  6: "@min-[36rem]/metrics:grid-cols-3 @min-[60rem]/metrics:grid-cols-6",
};

/**
 * The figures' grid, sized by the space the panel has (a container query on this wrapper, so it also fits a
 * half-width card), never the window: two across, then three, then all of them in one row once each has room.
 */
export function AnalyticsMetricGrid({ count, children, label }: { count: number; children: ReactNode; label?: string }) {
  return (
    <div className="@container/metrics">
      <dl aria-label={label} className={cn("grid grid-cols-2 gap-3", WIDE[Math.min(count, 6)])}>
        {children}
      </dl>
    </div>
  );
}

/**
 * One figure: its name, the number, how it moved against the previous equal period (only when that can be said: see
 * lib/analytics-channels previousPeriod) and a line on what it counts. Three looks that never mix: a number (0 is a
 * real 0), "—" with "Not available" when the platform gave none, and the grid's skeleton while loading.
 * `plain`: no card of its own, for a figure inside another card.
 */
export function AnalyticsMetricCard({ label, value, hint, comparison, days, plain = false }: { label: string; value: number | null; hint?: string; comparison?: Comparison | null; days?: number; plain?: boolean }) {
  const missing = value == null;
  return (
    <div className={cn("flex min-w-0 flex-col", plain ? "" : "rounded-2xl border border-border bg-card px-4 py-3.5")} title={hint || undefined}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 text-2xl font-semibold leading-tight tracking-tight tabular-nums", missing && "text-muted-foreground")}>{fmt(value)}</dd>
      {comparison && !missing && days ? <Change value={value} comparison={comparison} days={days} /> : null}
      {missing ? <dd className="mt-1 text-xs text-muted-foreground">Not available</dd> : hint && !plain ? <dd className="mt-1 text-xs leading-snug text-muted-foreground text-pretty">{hint}</dd> : null}
    </div>
  );
}

function Change({ value, comparison: c, days }: { value: number; comparison: Comparison; days: number }) {
  const before = `previous ${days} days`;
  const tip = `${c.previous.toLocaleString()} in the ${before}`;
  if (c.change === null) {
    return (
      <dd className="mt-1 text-xs text-muted-foreground" title={tip}>
        {value === 0 ? `None in the ${before} either` : `Up from 0 in the ${before}`}
      </dd>
    );
  }
  const label = changeLabel(c.change);
  const up = label.startsWith("+");
  const down = label.startsWith("−");
  const Icon = up ? ArrowUpRight : down ? ArrowDownRight : Minus;
  return (
    <dd className="mt-1 flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground" title={tip}>
      <span className={cn("inline-flex items-center gap-0.5 font-medium tabular-nums", up ? "text-success-ink" : down ? "text-warning-ink" : "text-foreground")}>
        <Icon aria-hidden className="size-3.5" />
        {label}
      </span>
      <span>vs {before}</span>
    </dd>
  );
}

/** The figures' loading look: the same grid, one grey block per figure to come. */
export function AnalyticsMetricGridSkeleton({ count }: { count: number }) {
  return (
    <div className="@container/metrics" aria-hidden>
      <div className={cn("grid grid-cols-2 gap-3", WIDE[Math.min(count, 6)])}>
        {Array.from({ length: count }, (_, i) => (
          <div key={i} className="h-[6.5rem] animate-pulse rounded-2xl bg-muted" />
        ))}
      </div>
    </div>
  );
}
