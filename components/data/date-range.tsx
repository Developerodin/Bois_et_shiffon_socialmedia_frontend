"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import { addDays, PRESETS, presetRange, rangeDays, type DateRange } from "@/lib/data-api";
import { SEARCH_RANGE_MAX_DAYS } from "@/shared";

const DAY = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "3 Nov 2026 – 30 Nov 2026": the range's own days, not shifted into the viewer's zone. */
export const rangeLabel = (r: DateRange) => `${DAY.format(new Date(`${r.from}T00:00:00Z`))} – ${DAY.format(new Date(`${r.to}T00:00:00Z`))}`;

/** Why a custom range can't be applied, or "" when it can. Same rules as readRange, so an applied range survives a reload. */
function customProblem(from: string, to: string, end: string): string {
  if (!from || !to) return "Pick both days.";
  if (from > to) return "The first day must come before the last.";
  if (to > end) return `The last day can be ${DAY.format(new Date(`${end}T00:00:00Z`))} at the latest.`;
  if (rangeDays({ from, to }) > SEARCH_RANGE_MAX_DAYS) return `Pick at most ${SEARCH_RANGE_MAX_DAYS} days.`;
  return "";
}

/** The shared filter: the last 7, 28 or 90 days ending on `end` (presetEnd), or Custom: any days up to `end`, at most 90. */
export function DateRangeFilter({ range, end, onChange }: { range: DateRange; end: string; onChange: (r: DateRange) => void }) {
  const preset = range.to === end && PRESETS.find((n) => n === rangeDays(range));
  const [editing, setEditing] = useState(false);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const custom = editing || !preset;
  const problem = customProblem(from, to, end);

  const choose = (v: string) => {
    if (v === "custom") {
      setFrom(range.from);
      setTo(range.to);
      setEditing(true);
      return;
    }
    setEditing(false);
    onChange(presetRange(Number(v), end));
  };
  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    if (problem) return;
    setEditing(false);
    onChange({ from, to });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <SegmentedRadios
          label="Date range"
          name="date-range"
          value={custom ? "custom" : String(preset)}
          onChange={choose}
          options={[...PRESETS.map((n) => ({ value: String(n), label: `${n} days` })), { value: "custom", label: "Custom" }]}
        />
        <span className="text-sm text-muted-foreground">{rangeLabel(range)}</span>
      </div>
      {editing && (
        <form onSubmit={apply} className="flex flex-wrap items-end gap-3" aria-label="Custom date range">
          <label className="flex flex-col gap-1 text-sm">
            From
            <Input type="date" value={from} min={addDays(end, -365)} max={end} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            To
            <Input type="date" value={to} min={from || undefined} max={end} onChange={(e) => setTo(e.target.value)} className="w-auto" />
          </label>
          <Button type="submit" disabled={!!problem}>Apply</Button>
          <Button type="button" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
          {problem && <p className="w-full text-sm text-muted-foreground" role="status">{problem}</p>}
        </form>
      )}
    </div>
  );
}
