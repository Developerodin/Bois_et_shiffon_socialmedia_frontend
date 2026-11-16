import { Table, type Fx } from "@/components/admin/ui";

/**
 * Spend per day: one series (total = AI + other paid APIs), columns from one baseline. Built to the dataviz spec:
 * bars ≤ 24 px with a 4 px rounded top and square base, a gap between neighbours, recessive grid, three clean
 * y-ticks, only the peak labelled, a per-bar tooltip (the whole column is the hover target) and a table view.
 * The bar colour is --chart-1 (globals.css), validated against both themes' surfaces.
 * Server-rendered SVG, drawn three times on canvases of different widths (same data) so the labels stay near their
 * real size from a phone to a wide monitor; the container's width picks which one shows.
 */
type Day = { day: string; aiUsd: number; apiUsd: number; calls: number };

const H = 200;
const M = { top: 22, right: 8, bottom: 24, left: 52 };
const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const label = (d: string) => DATE.format(new Date(`${d}T00:00:00Z`));
const usd = (v: number) => (v === 0 ? "$0" : v >= 100 ? `$${v.toFixed(0)}` : v >= 1 ? `$${v.toFixed(2)}` : `$${v.toFixed(v >= 0.01 ? 3 : 4)}`);

/** A round axis top: 1, 2 or 5 × a power of ten, at or above the largest value. */
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/** A column with a 4 px rounded top and a square base (path, since <rect> rounds all four corners). */
function column(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function Plot({ days, totals, fx, W, ariaLabel, className }: { days: Day[]; totals: number[]; fx: Fx; W: number; ariaLabel: string; className: string }) {
  const top = niceMax(Math.max(...totals));
  const plotW = W - M.left - M.right;
  const plotH = H - M.top - M.bottom;
  const band = plotW / days.length;
  const barW = Math.max(1, Math.min(24, band - 2)); // leave at least a 2 px gap
  const y = (v: number) => M.top + plotH - (v / top) * plotH;
  const peak = totals.indexOf(Math.max(...totals));
  // A narrow canvas has room for the first and last date only.
  const xTicks = [...new Set(W < 500 ? [0, days.length - 1] : [0, Math.floor((days.length - 1) / 2), days.length - 1])];
  const rupees = (v: number) => (fx ? ` (₹${(v * fx.rate).toFixed(2)})` : "");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={ariaLabel}>
      {[0, top / 2, top].map((t) => (
        <g key={t}>
          <line x1={M.left} x2={W - M.right} y1={y(t)} y2={y(t)} stroke="var(--border)" strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
          <text x={M.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px] tabular-nums">
            {usd(t)}
          </text>
        </g>
      ))}
      {days.map((d, i) => {
        const v = totals[i];
        const x = M.left + i * band + (band - barW) / 2;
        const h = (v / top) * plotH;
        return (
          <g key={d.day} className="group">
            <title>{`${label(d.day)}: ${usd(v)}${rupees(v)} · AI ${usd(d.aiUsd)} · other APIs ${usd(d.apiUsd)} · ${d.calls.toLocaleString("en")} AI calls`}</title>
            {/* The whole column is the hover target, not just the (often tiny) bar. */}
            <rect x={M.left + i * band} y={M.top} width={band} height={plotH} fill="transparent" />
            {v > 0 ? <path d={column(x, y(v), barW, Math.max(h, 1.5))} className="grow-y fill-[var(--chart-1)] transition-opacity group-hover:opacity-75 motion-reduce:transition-none" style={{ animationDelay: `${Math.min(i * 12, 360)}ms` }} /> : null}
            {i === peak ? (
              <text x={Math.min(Math.max(x + barW / 2, M.left + 16), W - M.right - 16)} y={y(v) - 6} textAnchor="middle" className="fill-foreground text-[10px] font-medium tabular-nums">
                {usd(v)}
              </text>
            ) : null}
          </g>
        );
      })}
      {xTicks.map((i) => (
        <text key={i} x={M.left + i * band + band / 2} y={H - 6} textAnchor={i === 0 ? "start" : i === days.length - 1 ? "end" : "middle"} className="fill-muted-foreground text-[10px]">
          {label(days[i].day)}
        </text>
      ))}
    </svg>
  );
}

export function SpendChart({ days, fx, title }: { days: Day[]; fx: Fx; title: string }) {
  const totals = days.map((d) => d.aiUsd + d.apiUsd);
  const sum = totals.reduce((a, b) => a + b, 0);
  if (!days.length || sum === 0) {
    return <p className="rounded-xl border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">No spend in this period.</p>;
  }
  const peak = totals.indexOf(Math.max(...totals));
  const ariaLabel = `${title}: ${usd(sum)} in all; highest ${usd(totals[peak])} on ${label(days[peak].day)}. The table below has every day.`;

  return (
    <figure className="@container flex flex-col gap-3">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="rounded-xl border border-border bg-card p-3">
        <Plot days={days} totals={totals} fx={fx} W={1120} ariaLabel={ariaLabel} className="hidden h-auto w-full @4xl:block" />
        <Plot days={days} totals={totals} fx={fx} W={720} ariaLabel={ariaLabel} className="hidden h-auto w-full @xl:block @4xl:hidden" />
        <Plot days={days} totals={totals} fx={fx} W={360} ariaLabel={ariaLabel} className="h-auto w-full @xl:hidden" />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer py-1 text-xs text-muted-foreground hover:text-foreground">Show as a table</summary>
        <div className="mt-3">
          <Table
            head={["Day", "AI", "Other APIs", "Total", "AI calls"]}
            numeric={[1, 2, 3, 4]}
            empty=""
            rows={days.filter((d) => d.aiUsd + d.apiUsd > 0 || d.calls > 0).map((d) => [label(d.day), usd(d.aiUsd), usd(d.apiUsd), usd(d.aiUsd + d.apiUsd), d.calls.toLocaleString("en")])}
          />
        </div>
      </details>
    </figure>
  );
}
