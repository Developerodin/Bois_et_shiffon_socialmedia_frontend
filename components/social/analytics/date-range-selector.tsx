"use client";

import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { RANGES, type Range } from "@/lib/analytics-channels";

const OPTIONS = RANGES.map((r) => ({ value: String(r), label: `${r} days` }));

/** The period: 7, 14 or 28 days, as the app's segmented pills (native radios: one tab stop, arrow keys move). */
export function DateRangeSelector({ value, onChange }: { value: Range; onChange: (days: Range) => void }) {
  return <SegmentedRadios label="Period" name="analytics-period" value={String(value)} onChange={(v) => onChange(Number(v) as Range)} options={OPTIONS} />;
}
