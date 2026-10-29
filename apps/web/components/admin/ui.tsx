import Link from "next/link";
import { SegmentedLinks } from "@/components/admin/segmented-links";
import { cn } from "@/lib/utils";

/** Small building blocks for the platform admin console (app/(shell)/admin). Server components only. */

export type Fx = { rate: number; from: string; asOf?: Date } | null;

const DATE = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
export const when = (d: Date | string | null | undefined) => (d ? `${DATE.format(new Date(d))} UTC` : "–");

const DAY_MONTH = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
/** "21 Oct", or "21 Oct 2025" outside the current year. */
export const day = (d: Date | string) => (new Date(d).getUTCFullYear() === new Date().getUTCFullYear() ? DAY_MONTH : DAY_MONTH_YEAR).format(new Date(d));

/** "just now", "12 min ago", "3 h ago", "yesterday", "4 days ago", then the date. The exact time is on hover. */
export function Ago({ at }: { at: Date | string | null | undefined }) {
  if (!at) return <Empty />;
  const d = new Date(at);
  const min = Math.round((Date.now() - +d) / 60_000);
  const text = min < 2 ? "just now" : min < 60 ? `${min} min ago` : min < 60 * 24 ? `${Math.round(min / 60)} h ago` : min < 60 * 48 ? "yesterday" : min < 60 * 24 * 14 ? `${Math.round(min / 1440)} days ago` : day(d);
  return (
    <time dateTime={d.toISOString()} title={when(d)} className="whitespace-nowrap">
      {text}
    </time>
  );
}

/** An empty cell: a quiet dash, read out as "none". */
export const Empty = () => (
  <span className="text-muted-foreground/60" aria-label="none">
    –
  </span>
);

/** Dollars, with rupees in small type underneath; zero is an empty cell. */
export function Money({ usd, fx, share }: { usd: number; fx: Fx; share?: number }) {
  if (usd < 0.00005) return <Empty />;
  return (
    <span className="inline-flex flex-col items-end">
      <span className="tabular-nums">${usd.toFixed(usd >= 100 ? 0 : usd >= 1 ? 2 : 4)}</span>
      {fx ? <span className="text-xs tabular-nums text-muted-foreground">₹{(usd * fx.rate).toFixed(usd * fx.rate >= 100 ? 0 : 2)}</span> : null}
      {share !== undefined ? (
        <span className="mt-1.5 h-1 w-20 overflow-hidden rounded-full bg-muted" title={`${Math.round(share * 100)}% of customer spend`}>
          <span className="grow-x block h-full rounded-full bg-primary" style={{ width: `${Math.max(2, share * 100)}%` }} />
        </span>
      ) : null}
    </span>
  );
}

export function Stat({ label, value, hint, href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string }) {
  const body = (
    <>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </>
  );
  const box = "block rounded-xl border border-border bg-card px-4 py-3";
  return href ? (
    <Link href={href} className={cn(box, "transition-colors hover:border-primary/50 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring")}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}

export function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-24 flex flex-col gap-3">
      <div>
        <h2 id={`${id}-h`} className="font-display text-lg font-medium">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A table where there's room for one, stacked cards where there isn't. It answers to its own width (a container
 * query), not the screen's, so a table in a half-width column on a wide screen becomes cards too. Cards: the first
 * column is the card's title, the rest are label / value pairs. Both forms are in the page; CSS shows one.
 * `wide`: many columns, so the table form waits for more room (64 rem instead of 48).
 */
export function Table({ head, rows, empty, numeric = [], wide = false }: { head: string[]; rows: React.ReactNode[][]; empty: string; numeric?: number[]; wide?: boolean }) {
  if (!rows.length) return <p className="rounded-xl border border-dashed border-border px-4 py-6 text-sm text-muted-foreground">{empty}</p>;
  return (
    <div className="@container">
      <div className={cn("hidden overflow-x-auto rounded-xl border border-border bg-card", wide ? "@5xl:block" : "@3xl:block")}>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
            <tr>
              {head.map((h, i) => (
                <th key={h} scope="col" className={cn("whitespace-nowrap px-3 py-2.5 font-medium", numeric.includes(i) && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((r, i) => (
              <tr key={i} className="align-top transition-colors hover:bg-muted/40">
                {r.map((c, j) => (
                  <td key={j} className={cn("px-3 py-2.5", numeric.includes(j) && "whitespace-nowrap text-right tabular-nums")}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={cn("divide-y divide-border rounded-xl border border-border bg-card", wide ? "@5xl:hidden" : "@3xl:hidden")}>
        {rows.map((r, i) => (
          <li key={i} className="flex flex-col gap-2.5 px-4 py-3 text-sm">
            <div className="min-w-0 break-words">{r[0]}</div>
            {r.length > 1 ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 @md:grid-cols-3">
                {r.slice(1).map((c, j) => (
                  <div key={j} className="min-w-0">
                    <dt className="text-xs text-muted-foreground">{head[j + 1]}</dt>
                    {/* Values left-aligned here (Money right-aligns itself for table columns). */}
                    <dd className="mt-0.5 break-words tabular-nums [&_.items-end]:items-start">{c}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Pill({ tone = "muted", children }: { tone?: "good" | "warn" | "bad" | "muted"; children: React.ReactNode }) {
  const tones = { good: "border-success/40 bg-success/10 text-success", warn: "border-warning/40 bg-warning/10 text-warning", bad: "border-destructive/40 bg-destructive/10 text-destructive", muted: "border-border bg-muted text-muted-foreground" };
  return <span className={cn("inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium", tones[tone])}>{children}</span>;
}

export function Crumbs({ items }: { items: { href?: string; label: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
      {items.map((it, i) => (
        <span key={it.label}>
          {i ? " / " : ""}
          {it.href ? (
            <Link href={it.href} className="underline-offset-4 hover:underline">
              {it.label}
            </Link>
          ) : (
            <span className="text-foreground">{it.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

/** A URL for this page with some query values changed (empty removes one; changing a filter resets the page). */
export function withQuery(path: string, current: Record<string, string | undefined>, change: Record<string, string | undefined>) {
  const next = new URLSearchParams();
  const merged = { ...current, ...("page" in change ? {} : { page: undefined }), ...change };
  for (const [k, v] of Object.entries(merged)) if (v) next.set(k, v);
  const s = next.toString();
  return s ? `${path}?${s}` : path;
}

/** A row of mutually exclusive filter links (one is current). Plain links: every view has its own URL. */
export function Segmented({ label, options, value, href }: { label: string; options: { value: string; label: string }[]; value: string; href: (value: string) => string }) {
  // Links worked out here on the server; the sliding pill is the browser's part.
  return <SegmentedLinks label={label} value={value} options={options.map((o) => ({ value: o.value, label: o.label, href: href(o.value) }))} />;
}

/** Search as a plain GET form: works without JavaScript, and the result has its own URL. */
export function SearchBox({ placeholder, value, hidden = {} }: { placeholder: string; value?: string; hidden?: Record<string, string | undefined> }) {
  return (
    <form role="search" className="flex items-center gap-2">
      {Object.entries(hidden).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <label className="sr-only" htmlFor="admin-search">
        {placeholder}
      </label>
      <input
        id="admin-search"
        name="q"
        type="search"
        defaultValue={value}
        placeholder={placeholder}
        className="h-9 w-64 max-w-full rounded-full border border-input bg-card px-4 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
    </form>
  );
}

/** Newer / older page links under a list. */
export function Pager({ page, hasMore, href }: { page: number; hasMore: boolean; href: (page: number) => string }) {
  if (page === 1 && !hasMore) return null;
  const link = "rounded-full border border-border px-3 py-1.5 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <nav aria-label="Pages" className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
      {page > 1 ? <Link className={link} href={href(page - 1)}>← Newer</Link> : <span />}
      <span>Page {page}</span>
      {hasMore ? <Link className={link} href={href(page + 1)}>Older →</Link> : <span />}
    </nav>
  );
}

/** Page header for the console: eyebrow, title, one line of context. */
export function PageHeader({ eyebrow, title, children, crumbs }: { eyebrow?: string; title: string; children?: React.ReactNode; crumbs?: { href?: string; label: string }[] }) {
  return (
    <header className="flex flex-col gap-2">
      {crumbs ? <Crumbs items={crumbs} /> : eyebrow ? <p className="font-mono text-xs uppercase tracking-[0.14em] text-primary">{eyebrow}</p> : null}
      <h1 className="font-display text-3xl font-medium tracking-tight text-balance">{title}</h1>
      {children ? <div className="max-w-prose text-sm text-muted-foreground">{children}</div> : null}
    </header>
  );
}

