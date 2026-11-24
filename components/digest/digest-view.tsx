import type { DigestDto, DigestSection } from "@/shared";

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
          {s.overdueTitles.length > 0 && (
            <ul className="mt-2 list-disc pl-5 text-sm">
              {s.overdueTitles.map((t, i) => (
                <li key={i}>{t}</li>
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
      return s.data.length ? <Figures items={s.data.map((c) => [`${c.currency} net (${n(c.orders)} orders)`, c.netSales])} /> : <p className="text-sm text-muted-foreground">No orders this week</p>;
    case "ads":
      if (!s.data) return NO_DATA;
      return s.data.length ? <Figures items={s.data.map((c) => [`${c.currency} spent (${n(c.purchases)} purchases)`, c.spend])} /> : <p className="text-sm text-muted-foreground">No spend this week</p>;
  }
}

/** The weekly digests as the server sent them (already filtered by what the reader may see now). */
export function DigestView({ digests }: { digests: DigestDto[] }) {
  if (!digests.length) return <p className="text-sm text-muted-foreground">Your first digest arrives on Monday.</p>;
  return (
    <div className="flex flex-col gap-10">
      {digests.map((d) => (
        <section key={d.id} aria-labelledby={`digest-${d.id}`} className="flex flex-col gap-4">
          <h2 id={`digest-${d.id}`} className="text-base font-semibold">
            Week of {d.weekStart}
          </h2>
          {d.body.brands.length === 0 && <p className="text-sm text-muted-foreground">Nothing you can still see in this week.</p>}
          {d.body.brands.map((b) => (
            <article key={b.brandId} className="rounded-xl border border-border p-5">
              <h3 className="font-medium">
                {b.brandName}{" "}
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
