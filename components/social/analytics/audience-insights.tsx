/** Region names in the reader's language ("FR" → "France"); the code itself when the browser can't name it. */
const REGION = (() => {
  try {
    return new Intl.DisplayNames(undefined, { type: "region" });
  } catch {
    return null;
  }
})();
export const countryName = (code: string) => {
  try {
    return REGION?.of(code) ?? code;
  } catch {
    return code;
  }
};

/**
 * Who follows the account, where the platform says so: today Instagram's followers by country (its top 5), as bars
 * against the largest, with each one's share of all followers when that count is known.
 */
export function AudienceInsights({ countries, followers }: { countries: { country: string; followers: number }[]; followers: number | null }) {
  const top = Math.max(...countries.map((c) => c.followers), 1);
  return (
    <section aria-labelledby="audience-title" className="min-w-0 rounded-2xl border border-border bg-card p-4 sm:p-5">
      <h3 id="audience-title" className="text-base font-semibold leading-tight">
        Audience
      </h3>
      <p className="mb-4 mt-0.5 text-xs text-muted-foreground">Followers by country, top {countries.length}</p>
      <ol className="flex flex-col gap-3">
        {countries.map((c) => (
          <li key={c.country} className="text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate">{countryName(c.country)}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {c.followers.toLocaleString()}
                {followers ? <span className="ml-1.5 text-xs">{Math.round((c.followers / followers) * 100)}%</span> : null}
              </span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-[var(--chart-1)]" style={{ width: `${(c.followers / top) * 100}%` }} />
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
