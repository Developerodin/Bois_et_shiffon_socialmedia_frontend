"use client";

import { useCallback, useState } from "react";
import { errorMessage, request } from "@/components/settings/api";
import { ListSkeleton, LoadError, selectClass, useLoad } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageSection } from "@/components/ui/page-section";
import { money } from "@/components/data/shared";
import { cn } from "@/lib/utils";
import { AD_BUDGET_PLATFORMS, ECB_CURRENCIES, type AdBudgetPlatform, type AdBudgetsDto, type PacingDto, type SetAdBudgetBody } from "@/shared";

const PLATFORM: Record<AdBudgetPlatform, string> = { META: "Meta", GOOGLE: "Google" };
const CURRENCIES = ["EUR", ...ECB_CURRENCIES];
const MONTH = new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
const monthLabel = (m: string) => MONTH.format(new Date(`${m}-01T00:00:00Z`));
const dayLabel = (d: string) => DAY.format(new Date(`${d}T00:00:00Z`));

/** One line on how a budget is pacing. Pure, so it can be checked without rendering. */
export function pacingLine(p: PacingDto | undefined): string {
  if (!p) return "";
  switch (p.state) {
    case "no_data": return "No ad data for this month yet.";
    case "no_rate": return "No exchange rate yet to compare the spend with this budget.";
    case "google_later": return "Google Ads spend arrives in Phase 3.";
    case "ok": {
      const word = p.status === "under" ? "Under pace" : p.status === "over" ? "Over pace" : "On pace";
      const stale = p.staleRateFrom ? ` Uses an exchange rate from ${dayLabel(p.staleRateFrom)}.` : "";
      return `${word}: ${money(p.spent, p.currency)} spent through ${dayLabel(p.through)}, ${money(p.expected, p.currency)} expected by then (${Math.round(p.ratio * 100)} %).${stale}`;
    }
  }
}

/**
 * The month's Meta and Google ad budgets with Meta's pacing (GET ads/budgets; ads.read). `canEdit`
 * (commercial.manage; the server also needs ads.read) shows the form: an amount of 0 removes a budget.
 */
export function AdBudgets({ base, month, canEdit }: { base: string; month: string; canEdit: boolean }) {
  const fetcher = useCallback(() => request<AdBudgetsDto>(`${base}/ads/budgets?month=${month}`), [base, month]);
  const { state, reload } = useLoad(fetcher);

  let body: React.ReactNode;
  if (state.kind === "loading") body = <ListSkeleton label="Loading budgets" rows={1} />;
  else if (state.kind === "forbidden") body = <p className="text-sm text-muted-foreground">You can&apos;t see ad budgets.</p>;
  else if (state.kind === "error") body = <LoadError message={state.message} onRetry={reload} />;
  else {
    const d = state.data;
    body = (
      <div className="flex flex-col gap-3">
        {d.budgets.length ? (
          <ul className="flex flex-col gap-2 text-sm">
            {d.budgets.map((b) => (
              <li key={b.platform}>
                <span className="font-medium">{PLATFORM[b.platform]}: {money(b.amount, b.currency)}</span>
                <span className="block text-xs text-muted-foreground">{pacingLine(d.pacing.find((p) => p.platform === b.platform))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No budget set for {monthLabel(month)}.</p>
        )}
        {canEdit ? <BudgetForm base={base} month={month} data={d} onSaved={reload} /> : null}
      </div>
    );
  }
  return (
    <PageSection id="ads-budgets" title={`Budgets for ${monthLabel(month)}`} description="Monthly ad budgets per platform, and how Meta spend is pacing against them.">
      {body}
    </PageSection>
  );
}

function BudgetForm({ base, month, data, onSaved }: { base: string; month: string; data: AdBudgetsDto; onSaved: () => void }) {
  const [platform, setPlatform] = useState<AdBudgetPlatform>("META");
  const current = data.budgets.find((b) => b.platform === platform);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosen = currency || current?.currency || data.defaultCurrency;

  const save = async (value: string) => {
    setBusy(true);
    setError("");
    try {
      await request(`${base}/ads/budgets`, { method: "PUT", body: JSON.stringify({ platform, month, amount: value, currency: chosen } satisfies SetAdBudgetBody) });
      setAmount("");
      onSaved();
    } catch (e) {
      setError(errorMessage(e, "Couldn't save the budget. Try again."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save(amount.trim());
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-xs font-medium">
          Platform
          <select className={cn(selectClass, "sm:w-auto")} value={platform} onChange={(e) => setPlatform(e.target.value as AdBudgetPlatform)}>
            {AD_BUDGET_PLATFORMS.map((p) => <option key={p} value={p}>{PLATFORM[p]}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Amount
          <Input inputMode="decimal" className="w-36" value={amount} placeholder={current?.amount ?? "0.00"} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-medium">
          Currency
          <select className={cn(selectClass, "sm:w-auto")} value={chosen} onChange={(e) => setCurrency(e.target.value)}>
            {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <Button type="submit" size="sm" disabled={busy || !amount.trim()}>{busy ? "Saving…" : "Save budget"}</Button>
        {current ? <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void save("0")}>Remove</Button> : null}
      </div>
      {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
    </form>
  );
}
