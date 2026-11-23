"use client";

import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { PRESETS, presetRange, rangeDays, type DateRange } from "@/lib/data-api";

const DAY = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "3 Nov 2026 – 30 Nov 2026": the range's own days, not shifted into the viewer's zone. */
export const rangeLabel = (r: DateRange) => `${DAY.format(new Date(`${r.from}T00:00:00Z`))} – ${DAY.format(new Date(`${r.to}T00:00:00Z`))}`;

/** The shared filter: the last 7, 28 or 90 days ending on `end` (presetEnd). A custom ?from&to shows no pill chosen. */
export function DateRangeFilter({ range, end, onChange }: { range: DateRange; end: string; onChange: (r: DateRange) => void }) {
  const current = range.to === end && PRESETS.find((n) => n === rangeDays(range));
  return (
    <div className="flex flex-wrap items-center gap-3">
      <SegmentedRadios
        label="Date range"
        name="date-range"
        value={current ? String(current) : "custom"}
        onChange={(v) => onChange(presetRange(Number(v), end))}
        options={PRESETS.map((n) => ({ value: String(n), label: `${n} days` }))}
      />
      <span className="text-sm text-muted-foreground">{rangeLabel(range)}</span>
    </div>
  );
}
