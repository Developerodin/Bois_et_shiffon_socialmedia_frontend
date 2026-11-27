"use client";

import { useCallback, useState } from "react";
import { CRM_LIMITS, DEAL_STAGE_LABEL, OPEN_DEAL_STAGES, type CompanyDto, type ConversationRow, type DealDto, type DealStage, type QuoteStatus } from "@/shared";
import { crmApi, type DealFields } from "@/components/crm/api";
import { CrmLink, crmHref } from "@/components/crm/crm-link";
import { CustomerPicker } from "@/components/crm/customers/customer-picker";
import { OwnerSelect } from "@/components/crm/customers/owner-select";
import type { Owner } from "@/components/crm/customers/people";
import { CHANNEL_LABEL, FOLLOW_UP_STATE_LABEL, stateTone } from "@/components/crm/follow-ups/labels";
import { QUOTE_STATUS_LABEL } from "@/components/crm/quotes/quotes-board";
import { conversationLink, DEAL_TITLE_HINT, dealHints, dealValueProblem } from "@/components/crm/pipeline/labels";
import { ApiError, errorMessage } from "@/components/settings/api";
import { ListSkeleton, selectClass, useLoad } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { LoadFailed } from "@/components/ui/load-failed";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
/** A conversation in the deal's picker: its subject, else its channel. */
const conversationName = (c: Pick<ConversationRow, "subject" | "channel">) => c.subject ?? CHANNEL_LABEL[c.channel];

type Draft = { title: string; customer: { id: string; displayName: string } | null; companyId: string; conversationId: string; value: string; currency: string; ownerId: string; nextAction: string; nextActionDue: string; stage: DealStage };
const draftOf = (d: DealDto | null, currency: string): Draft => ({
  title: d?.title ?? "",
  customer: d?.customer ?? null,
  companyId: d?.company?.id ?? "",
  conversationId: d?.conversationId ?? "",
  value: d?.value ?? "",
  currency: d?.currency ?? currency,
  ownerId: d?.ownerId ?? "",
  nextAction: d?.nextAction ?? "",
  nextActionDue: d?.nextActionDue ?? "",
  stage: d?.stage ?? "NEW",
});

/**
 * A new deal, or one deal's details (stages move from the card). Edits save on the `updatedAt` read (409 asks for a
 * reload). The title warns against personal data: link the customer instead. With inbox.read, the deal can link one
 * of its customer's conversations.
 */
export function DealDialog({ w, b, deal, companies, owners, defaultCurrency, canInbox, onClose, onSaved, onStale }: {
  w: string;
  b: string;
  /** inbox.read: see and change the linked conversation (the server refuses a link without it, 400 crm.needsInbox). */
  canInbox: boolean;
  /** null: a new deal */
  deal: DealDto | null;
  companies: CompanyDto[] | null;
  owners: readonly Owner[];
  /** The currency a new deal starts with (the one most deals here use). */
  defaultCurrency: string;
  onClose(): void;
  onSaved(d: DealDto): void;
  /** The deal changed since it was read: the board reads it again. */
  onStale(): void;
}) {
  const [draft, setDraft] = useState(() => draftOf(deal, defaultCurrency));
  const [picking, setPicking] = useState(false);
  const [pickingConversation, setPickingConversation] = useState(false);
  // The picked conversation's name; a link saved earlier has none here (no read by id), so it shows as a plain link.
  const [conversationLabel, setConversationLabel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const edit = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const problem = dealValueProblem(draft.value, draft.currency);
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
      ...conversationLink(deal?.conversationId ?? null, draft.conversationId, canInbox),
    };
    try {
      const { deal: d } = deal ? await crmApi.updateDeal(w, b, deal.id, { ...fields, updatedAt: deal.updatedAt }) : await crmApi.createDeal(w, b, { ...fields, stage: draft.stage });
      onSaved(d);
    } catch (e) {
      const stale = e instanceof ApiError && e.code === "crm.changed";
      if (stale) onStale();
      setError(stale ? "Someone changed this deal since you opened it. Close this and open the deal again from the board to see their change." : errorMessage(e));
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
          {canInbox ? (
            <div className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Conversation</span>
              <div className="flex flex-wrap items-center gap-2">
                {draft.conversationId ? (
                  <CrmLink href={crmHref("follow-ups", { c: draft.conversationId })}>{conversationLabel ?? "The linked conversation"}</CrmLink>
                ) : (
                  <span>None</span>
                )}
                {draft.customer ? (
                  <Button type="button" size="sm" variant="ghost" aria-expanded={pickingConversation} onClick={() => setPickingConversation((p) => !p)}>
                    {draft.conversationId ? "Change" : "Pick a conversation"}
                  </Button>
                ) : null}
                {draft.conversationId ? (
                  <Button type="button" size="sm" variant="ghost" onClick={() => (edit({ conversationId: "" }), setConversationLabel(null))}>
                    Remove
                  </Button>
                ) : null}
              </div>
              {!draft.customer ? <span className="text-xs text-muted-foreground">Pick the deal&rsquo;s customer to choose one of their conversations.</span> : null}
              {pickingConversation && draft.customer ? (
                <ConversationChoices
                  key={draft.customer.id}
                  w={w}
                  b={b}
                  customerId={draft.customer.id}
                  current={draft.conversationId}
                  onPick={(c) => (edit({ conversationId: c.id }), setConversationLabel(conversationName(c)), setPickingConversation(false))}
                />
              ) : null}
            </div>
          ) : null}
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
            <OwnerSelect value={draft.ownerId} onChange={(ownerId) => edit({ ownerId })} owners={owners} />
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

/** The customer's conversations to link (read when the picker opens: reading a customer is audited), latest first. */
function ConversationChoices({ w, b, customerId, current, onPick }: { w: string; b: string; customerId: string; current: string; onPick(c: ConversationRow): void }) {
  const fetcher = useCallback(() => crmApi.customer(w, b, customerId).then((r) => r.customer.conversations ?? []), [w, b, customerId]);
  const { state, reload } = useLoad(fetcher);
  if (state.kind === "loading") return <ListSkeleton label="Loading the customer's conversations" rows={1} />;
  if (state.kind !== "ready") return <LoadFailed what="the customer's conversations" message={state.kind === "error" ? state.message : undefined} onRetry={reload} />;
  if (!state.data.length) return <p className="text-xs text-muted-foreground">This customer has no conversations yet. Log one from their page on the Customers tab.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
      {state.data.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            aria-current={c.id === current ? "true" : undefined}
            className="flex w-full flex-wrap items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted aria-[current]:bg-muted pointer-coarse:py-3"
            onClick={() => onPick(c)}
          >
            <span className="min-w-0 truncate">{conversationName(c)}</span>
            <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge tone={stateTone(c.state)}>{FOLLOW_UP_STATE_LABEL[c.state]}</StatusBadge>
              <time dateTime={c.lastMessageAt}>{SHORT_DATE.format(new Date(c.lastMessageAt))}</time>
            </span>
          </button>
        </li>
      ))}
    </ul>
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
