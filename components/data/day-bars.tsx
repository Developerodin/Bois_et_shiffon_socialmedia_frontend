/**
 * One number per day as columns from one baseline, drawn like the admin spend chart (components/admin/spend-chart.tsx,
 * which shares these helpers): bars ≤ 24 px with a 4 px rounded top, a recessive grid with three y-ticks, only the
 * peak labelled, a tooltip per day (the whole column is the hover target), --chart-1. No hooks, so it renders on the
 * server or in a client component. Drawn twice (narrow and wide canvas) so labels stay near their real size.
 */

/** A round axis top: 1, 2 or 5 × a power of ten, at or above the largest value. */
export function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/** A column with a 4 px rounded top and a square base (path, since <rect> rounds all four corners). */
export function column(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

export type DayValue = { day: string; value: number | null };

const M = { top: 18, right: 8, bottom: 22, left: 44 };
const DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
export const dayLabel = (d: string) => DATE.format(new Date(`${d}T00:00:00Z`));
/** Short axis numbers: 950, 1.2k, 3.4M. */
export const compact = (v: number) => new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(v);

function Plot({ days, what, W, H = 140, label, className }: { days: DayValue[]; what: string; W: number; H?: number; label: string; className: string }) {
  const values = days.map((d) => d.value ?? 0);
  const top = niceMax(Math.max(...values));
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const band = plotW / days.length;
  const barW = Math.max(1, Math.min(24, band - 2));
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const peak = values.indexOf(Math.max(...values));
  const xTicks = [...new Set(W < 500 ? [0, days.length - 1] : [0, Math.floor((days.length - 1) / 2), days.length - 1])];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={label}>
      {[0, top / 2, top].map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
          <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-xs tabular-nums">
            {compact(t)}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const v = values[i];
        const x = M.left + i * band + (band - barW) / 2;
        return (
          <g key={d.day} className="group">
            <title>{`${dayLabel(d.day)}: ${d.value === null ? "no number" : d.value.toLocaleString()} ${what}`}</title>
            <rect x={M.left + i * band} y={M.top} width={band} height={plotH} fill="transparent" />
            {v > 0 ? <path d={column(x, y(v), barW, Math.max((v / top) * plotH, 1.5))} className="grow-y fill-[var(--chart-1)] transition-opacity group-hover:opacity-75 motion-reduce:transition-none" style={{ animationDelay: `${Math.min(i * 12, 360)}ms` }} /> : null}
            {i === peak && v > 0 ? (
              <text x={Math.min(Math.max(x + barW / 2, M.left + 16), W - M.right - 16)} y={y(v) - 6} textAnchor="middle" className="fill-foreground text-xs font-medium tabular-nums">
                {compact(v)}
              </text>
            ) : null}
          </g>
        );
      })}
      {xTicks.map((i) => (
        <text key={i} x={M.left + i * band + band / 2} y={H - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-xs">
          {dayLabel(days[i].day)}
        </text>
      ))}
    </svg>
  );
}

/** `what`: the unit in words for tooltips and the label ("reach", "media views"). Nothing drawn without a number. */
/** `caption={false}`: the caller titles the chart itself; `title` still names it for screen readers. */
/** `tall`: a taller wide plot (180 px of 720 instead of 140), for a chart that is the page's main one. */
export function DayBars({ days, what, title, caption = true, tall = false }: { days: DayValue[]; what: string; title: string; caption?: boolean; tall?: boolean }) {
  if (!days.length || !days.some((d) => d.value !== null)) return <p className="text-xs text-muted-foreground">No daily numbers for these days.</p>;
  // No total: daily unique counts (reach) can't be added up. The figures above give the period's totals.
  const label = `${title}: daily ${what}, ${dayLabel(days[0].day)} to ${dayLabel(days[days.length - 1].day)}.`;
  return (
    <figure className="@container">
      {caption && <figcaption className="mb-1 text-xs text-muted-foreground">{title}</figcaption>}
      <Plot days={days} what={what} W={720} H={tall ? 180 : 140} label={label} className="hidden h-auto w-full @xl:block" />
      <Plot days={days} what={what} W={360} label={label} className="h-auto w-full @xl:hidden" />
    </figure>
  );
}
