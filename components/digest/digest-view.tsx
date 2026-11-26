import { Mail } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import type { DigestDto, DigestSales, DigestSection } from "@/shared";

const n = (v: number) => v.toLocaleString("en-GB");
const pct = (v: number | null) => (v === null ? "–" : `${(v * 100).toFixed(1)}%`);
const NO_DATA = <p className="text-sm text-muted-foreground">No data yet</p>;

const TITLES: Record<DigestSection["kind"], string> = { content: "Posts", tasks: "Tasks", seo: "Search", posts: "Top posts", sales: "Sales", ads: "Ads" };

function Figures({ items }: { items: [string, string][] }) {
  return (
    <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
      {items.map(([label, value]) => (
        <div key={label} className="flex gap-1.5">
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium tabular-nums">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One section's figures. Money stays per currency; a source never synced says "No data yet", never 0. */
function SectionBody({ s }: { s: DigestSection }) {
  switch (s.kind) {
    case "content":
      return <Figures items={[["Published", n(s.published)], ["Scheduled", n(s.scheduled)], ["Waiting for approval", n(s.awaitingApproval)]]} />;
    case "tasks":
      return (
        <>
          <Figures items={[["Done", n(s.done)], ["Open", n(s.open)], ["Overdue", n(s.overdue)]]} />
          {s.overdueTasks.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {s.overdueTasks.map((t) => (
                <li key={t.id}>{t.title}</li>
              ))}
            </ul>
          )}
        </>
      );
    case "seo":
      return s.data ? (
        <>
          <Figures items={[["Clicks", n(s.data.totals.clicks)], ["Impressions", n(s.data.totals.impressions)], ["CTR", pct(s.data.totals.ctr)]]} />
          <p className="mt-1 text-xs text-muted-foreground">
            Google&apos;s days {s.data.range.from} to {s.data.range.to} (Search Console runs 2–3 days behind)
          </p>
        </>
      ) : (
        NO_DATA
      );
    case "posts":
      return s.top.length ? (
        <ul className="text-sm">
          {s.top.map((p, i) => (
            <li key={i}>
              {p.title ?? "Untitled"} <span className="text-muted-foreground">({p.reach === null ? "reach not read yet" : `${n(p.reach)} reach`})</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No posts published this week</p>
      );
    case "sales":
      if (!s.data) return NO_DATA;
      return s.data.length ? <Figures items={s.data.map(salesFigure)} /> : <p className="text-sm text-muted-foreground">No orders this week</p>;
    case "ads":
      if (!s.data) return NO_DATA;
      return s.data.length ? <Figures items={s.data.map((c) => [`${c.currency} spent (${n(c.purchases)} purchases)`, c.spend])} /> : <p className="text-sm text-muted-foreground">No spend this week</p>;
  }
}

/** A currency's week: net without VAT when known (none when not); digests built before that change keep their net. */
function salesFigure(c: DigestSales): [string, string] {
  const orders = `${n(c.orders)} orders`;
  if (c.netExVat === undefined) return [`${c.currency} net (${orders})`, c.netSales ?? "—"];
  return [`${c.currency} net excl. VAT${c.exVatFrom ? ` from ${c.exVatFrom}` : ""} (${orders})`, c.netExVat ?? "—"];
}

/** The weekly digests as the server sent them (already filtered by what the reader may see now). */
export function DigestView({ digests }: { digests: DigestDto[] }) {
  if (!digests.length)
    return <EmptyState icon={Mail} title="No digest yet" description="Your first digest arrives on Monday: last week for each business you work on, as far as your role can see." />;
  return (
    <div className="flex flex-col gap-8">
      {digests.map((d) => (
        <section key={d.id} aria-labelledby={`digest-${d.id}`} className="flex flex-col gap-3">
          <h2 id={`digest-${d.id}`} className="font-display text-lg font-medium">
            Week of {d.weekStart}
          </h2>
          {d.body.brands.length === 0 && <p className="rounded-2xl border border-dashed border-border px-5 py-6 text-sm text-muted-foreground">Nothing you can still see in this week.</p>}
          {/* Cards by hand, not PageSection: a brand sits under its week's h2, so its title is an h3 (PageSection's is an h2). */}
          {d.body.brands.map((b) => (
            <article key={b.brandId} className="min-w-0 rounded-2xl border border-border bg-card px-5 py-4 shadow-sm">
              <h3 className="flex flex-wrap items-baseline gap-x-2 font-medium break-words">
                {b.brandName}
                <span className="text-xs font-normal text-muted-foreground">
                  {b.week.from} to {b.week.to}
                </span>
              </h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                {b.sections.map((s) => (
                  <div key={s.kind}>
                    <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{TITLES[s.kind]}</h4>
                    <SectionBody s={s} />
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>
      ))}
    </div>
  );
}
