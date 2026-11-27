"use client";

import { useState } from "react";
import { DEAL_STAGE_LABEL, OPEN_DEAL_STAGES, type DealDto, type QuoteDto } from "@/shared";
import { crmApi } from "@/components/crm/api";
import { CrmLink, crmHref } from "@/components/crm/crm-link";
import { errorMessage } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The open deals a quote can be linked to, in stage order. */
export const openDeals = (columns: { stage: string; deals: DealDto[] }[]) => columns.filter((c) => (OPEN_DEAL_STAGES as readonly string[]).includes(c.stage)).flatMap((c) => c.deals);

/**
 * The quote editor's Deal line: open the linked deal (or unlink), or link to an open deal picked from a list (read
 * when asked for). A quote already sent or accepted moves its deal forward on linking. `disabled` while the editor
 * has unsaved changes, as the Customer line.
 */
export function QuoteDeal({ w, b, quote, disabled, onChange }: { w: string; b: string; quote: QuoteDto; disabled: boolean; onChange(q: QuoteDto): void }) {
  const [deals, setDeals] = useState<DealDto[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const off = disabled || busy;

  const link = async (dealId: string | null) => {
    setBusy(true);
    setError(null);
    try {
      onChange((await crmApi.quoteDeal(w, b, quote.id, dealId)).quote);
      setPicking(false);
      setPick("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const startPicking = () => {
    setPicking(true);
    setError(null);
    if (deals) return;
    crmApi.pipeline(w, b).then(
      (r) => setDeals(openDeals(r.pipeline.columns)),
      (e: unknown) => (setError(errorMessage(e)), setPicking(false)),
    );
  };

  return (
    <section aria-labelledby="quote-deal-h" className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm">
      <h3 id="quote-deal-h" className="text-xs font-medium text-muted-foreground">
        Deal
      </h3>
      {quote.dealId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>Linked to a deal on the pipeline.</span>
          <CrmLink href={crmHref("pipeline", { deal: quote.dealId })} className="font-medium">
            Open the deal
          </CrmLink>
          <Button size="sm" variant="ghost" disabled={off} onClick={() => void link(null)}>
            {busy ? "Unlinking…" : "Unlink"}
          </Button>
        </div>
      ) : picking ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (pick) void link(pick);
          }}
        >
          {deals === null ? (
            <span className="text-muted-foreground" role="status">
              Loading the open deals…
            </span>
          ) : deals.length ? (
            <select className={cn(selectClass, "w-auto min-w-0 max-w-full pointer-coarse:h-11")} value={pick} onChange={(e) => setPick(e.target.value)} aria-label="Open deal">
              <option value="" disabled>
                Pick a deal
              </option>
              {deals.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title} ({DEAL_STAGE_LABEL[d.stage]}{d.customer ? `, ${d.customer.displayName}` : ""})
                </option>
              ))}
            </select>
          ) : (
            <span className="text-muted-foreground">No open deals. Add one on the Pipeline tab.</span>
          )}
          {deals?.length ? (
            <Button type="submit" size="sm" disabled={off || !pick}>
              {busy ? "Linking…" : "Link"}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="ghost" onClick={() => setPicking(false)}>
            Cancel
          </Button>
        </form>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Not on the pipeline.</span>
          <Button size="sm" variant="outline" disabled={off} onClick={startPicking}>
            Link to a deal
          </Button>
        </div>
      )}
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
