"use client";

import { useState, type ReactNode } from "react";
import { DayBars, dayLabel } from "@/components/data/day-bars";
import { SegmentedRadios } from "@/components/ui/segmented-radios";
import type { ChannelDayDto } from "@/shared";

export type ChartSeries = { key: string; label: string; what: string; days: ChannelDayDto[] };

/**
 * The page's chart in one card: a title, the period under it, a choice of series when there is more than one, and the
 * daily bars (components/data/day-bars: axis, grid, a tooltip per day). Only series with a number are passed in, so it
 * never draws an empty chart; with none it isn't rendered at all. `note`: a line under the plot (days still counted).
 */
export function AnalyticsChartCard({ series, from, to, note }: { series: ChartSeries[]; from: string; to: string; note?: ReactNode }) {
  const [key, setKey] = useState(series[0]?.key);
  const pick = series.find((s) => s.key === key) ?? series[0];
  if (!pick) return null;
  return (
    <section aria-label={`${pick.label} per day`} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight">{pick.label} per day</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {dayLabel(from)} – {dayLabel(to)}
          </p>
        </div>
        {series.length > 1 && <SegmentedRadios label="Chart" name="analytics-series" value={pick.key} onChange={setKey} options={series.map((s) => ({ value: s.key, label: s.label }))} size="sm" />}
      </div>
      <DayBars key={pick.key} days={pick.days} what={pick.what} title={`${pick.label} per day`} caption={false} tall />
      {note ? <p className="mt-3 text-xs text-muted-foreground">{note}</p> : null}
    </section>
  );
}
