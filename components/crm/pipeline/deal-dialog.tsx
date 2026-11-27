"use client";

import { useState } from "react";
import { CRM_LIMITS, DEAL_STAGE_LABEL, OPEN_DEAL_STAGES, type CompanyDto, type DealDto, type DealStage, type QuoteStatus } from "@/shared";
import { crmApi, type DealFields } from "@/components/crm/api";
import { CrmLink, crmHref } from "@/components/crm/crm-link";
import { CustomerPicker } from "@/components/crm/customers/customer-picker";
import type { Owner } from "@/components/crm/customers/people";
import { QUOTE_STATUS_LABEL } from "@/components/crm/quotes/quotes-board";
import { DEAL_TITLE_HINT, dealHints, dealValueProblem } from "@/components/crm/pipeline/labels";
import { ApiError, errorMessage } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type Draft = { title: string; customer: { id: string; displayName: string } | null; companyId: string; value: string; currency: string; ownerId: string; nextAction: string; nextActionDue: string; stage: DealStage };
const draftOf = (d: DealDto | null, currency: string): Draft => ({
  title: d?.title ?? "",
  customer: d?.customer ?? null,
  companyId: d?.company?.id ?? "",
  value: d?.value ?? "",
  currency: d?.currency ?? currency,
  ownerId: d?.ownerId ?? "",
  nextAction: d?.nextAction ?? "",
  nextActionDue: d?.nextActionDue ?? "",
  stage: d?.stage ?? "NEW",
});

/**
 * A new deal, or one deal's details (stages move from the card). Edits save on the `updatedAt` read (409 asks for a
 * reload). The title warns against personal data: link the customer instead.
 */
export function DealDialog({ w, b, deal, companies, owners, defaultCurrency, onClose, onSaved }: {
  w: string;
  b: string;
  /** null: a new deal */
  deal: DealDto | null;
  companies: CompanyDto[] | null;
  owners: readonly Owner[];
  /** The currency a new deal starts with (the one most deals here use). */
  defaultCurrency: string;
  onClose(): void;
  onSaved(d: DealDto): void;
}) {
  const [draft, setDraft] = useState(() => draftOf(deal, defaultCurrency));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const problem = dealValueProblem(draft.value, draft.currency);
  const ownerList = draft.ownerId && !owners.some((o) => o.id === draft.ownerId) ? [...owners, { id: draft.ownerId, name: "Another member" }] : owners;
  const companyList = companies ?? (deal?.company ? [deal.company] : []);

  const save = async () => {
    setBusy(true);
    setError(null);
    const fields: DealFields & { title: string } = {
      title: draft.title.trim(),
      customerId: draft.customer?.id ?? null,
      companyId: draft.companyId || null,
      value: draft.value.trim() || null,
      currency: draft.value.trim() ? draft.currency.trim().toUpperCase() : null,
      ownerId: draft.ownerId || null,
      nextAction: draft.nextAction.trim() || null,
      nextActionDue: draft.nextActionDue || null,
    };
    try {
      const { deal: d } = deal ? await crmApi.updateDeal(w, b, deal.id, { ...fields, updatedAt: deal.updatedAt }) : await crmApi.createDeal(w, b, { ...fields, stage: draft.stage });
      onSaved(d);
    } catch (e) {
      setError(e instanceof ApiError && e.code === "crm.changed" ? "Someone changed this deal since you opened it. Close this and open it again to see their change." : errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{deal ? deal.title : "New deal"}</DialogTitle>
          <DialogDescription>{deal ? `${DEAL_STAGE_LABEL[deal.stage]}. Move it between stages from its card.` : "An enquiry or sales opportunity on the pipeline."}</DialogDescription>
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem && draft.title.trim()) void save();
          }}
        >
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Title</span>
            <Input value={draft.title} onChange={(e) => edit({ title: e.target.value })} maxLength={CRM_LIMITS.dealTitle} required aria-describedby="deal-title-hint" />
            <span id="deal-title-hint" className="text-xs text-muted-foreground">
              {DEAL_TITLE_HINT}
            </span>
          </label>
          <div className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Customer</span>
            <div className="flex flex-wrap items-center gap-2">
              <span>{draft.customer?.displayName ?? "None"}</span>
              <Button type="button" size="sm" variant="ghost" aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
                {draft.customer ? "Change" : "Pick a customer"}
              </Button>
              {draft.customer ? (
                <Button type="button" size="sm" variant="ghost" onClick={() => edit({ customer: null })}>
                  Remove
                </Button>
              ) : null}
            </div>
            {picking ? <CustomerPicker w={w} b={b} label="Find the deal's customer" onPick={(c) => (edit({ customer: { id: c.id, displayName: c.displayName } }), setPicking(false))} /> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Company</span>
              <select className={cn(selectClass, "pointer-coarse:h-11")} value={draft.companyId} onChange={(e) => edit({ companyId: e.target.value })}>
                <option value="">No company</option>
                {companyList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Owner</span>
              <select className={cn(selectClass, "pointer-coarse:h-11")} value={draft.ownerId} onChange={(e) => edit({ ownerId: e.target.value })}>
                <option value="">Nobody yet</option>
                {ownerList.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Value (optional)</span>
                <Input value={draft.value} onChange={(e) => edit({ value: e.target.value })} inputMode="decimal" placeholder="1250.50" aria-describedby={problem ? "deal-value-problem" : undefined} />
              </label>
              <label className="flex w-20 flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Currency</span>
                <Input value={draft.currency} onChange={(e) => edit({ currency: e.target.value })} maxLength={3} className="uppercase" />
              </label>
            </div>
            {deal ? null : (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Stage</span>
                <select className={cn(selectClass, "pointer-coarse:h-11")} value={draft.stage} onChange={(e) => edit({ stage: e.target.value as DealStage })}>
                  {OPEN_DEAL_STAGES.map((s) => (
                    <option key={s} value={s}>
                      {DEAL_STAGE_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="flex flex-col gap-1.5 text-sm sm:col-span-2">
              <span className="text-muted-foreground">Next action (optional)</span>
              <Input value={draft.nextAction} onChange={(e) => edit({ nextAction: e.target.value })} maxLength={CRM_LIMITS.nextAction} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Due</span>
              <Input type="date" value={draft.nextActionDue} onChange={(e) => edit({ nextActionDue: e.target.value })} />
            </label>
          </div>
          {problem ? (
            <p id="deal-value-problem" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
          {deal ? <DealExtras deal={deal} /> : null}
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !!problem || !draft.title.trim()}>
              {busy ? "Saving…" : deal ? "Save" : "Add deal"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A deal's hints, closing reason and quotes (each a link to the Quotes tab). */
export function DealExtras({ deal }: { deal: DealDto }) {
  const hints = dealHints(deal);
  return (
    <div className="flex flex-col gap-2 text-sm">
      {hints.map((h) => (
        <p key={h} className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2">
          {h}
        </p>
      ))}
      {deal.quotes.length ? (
        <ul className="flex flex-wrap gap-x-3 gap-y-1">
          {deal.quotes.map((q) => (
            <li key={q.id}>
              <CrmLink href={crmHref("quotes", { quote: q.id })}>{q.number}</CrmLink>
              <span className="text-muted-foreground"> · {QUOTE_STATUS_LABEL[q.status as QuoteStatus] ?? q.status}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
