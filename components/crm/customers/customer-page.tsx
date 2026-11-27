"use client";

import { useCallback, useEffect, useState } from "react";
import { CRM_LIMITS, DEAL_STAGE_LABEL, type CompanyDto, type ConversationRow, type CustomerDto, type QuoteStatus } from "@/shared";
import { crmApi, type CustomerFields } from "@/components/crm/api";
import type { CrmAccess } from "@/components/crm/crm-link";
import { CompanyField } from "@/components/crm/customers/company-fields";
import { CustomerData, MergeDialog } from "@/components/crm/customers/customer-admin";
import { LogConversation } from "@/components/crm/follow-ups/log-conversation";
import { Identities } from "@/components/crm/customers/identities";
import { Notes } from "@/components/crm/customers/notes";
import { CHANNEL_LABEL, FOLLOW_UP_STATE_LABEL, stateTone } from "@/components/crm/follow-ups/labels";
import type { Owner } from "@/components/crm/customers/people";
import { CrmLink, crmHref } from "@/components/crm/crm-link";
import { QUOTE_STATUS_LABEL } from "@/components/crm/quotes/quotes-board";
import { ApiError, errorMessage } from "@/components/settings/api";
import { ListSkeleton, selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadFailed } from "@/components/ui/load-failed";
import { PageSection } from "@/components/ui/page-section";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";

/** The customer's editable fields as typed (every one a string; empty means none). */
export type FieldsDraft = { displayName: string; role: string; language: string; companyId: string; ownerId: string; nextAction: string; nextActionDue: string };

export const draftOf = (c?: CustomerDto): FieldsDraft => ({
  displayName: c?.displayName ?? "",
  role: c?.role ?? "",
  language: c?.language ?? "",
  companyId: c?.company?.id ?? "",
  ownerId: c?.ownerId ?? "",
  nextAction: c?.nextAction ?? "",
  nextActionDue: c?.nextActionDue ?? "",
});

/** The draft as sent: trimmed, and an empty field as null (cleared). */
export const fieldsBody = (d: FieldsDraft): CustomerFields & { displayName: string } => ({
  displayName: d.displayName.trim(),
  role: d.role.trim() || null,
  language: d.language.trim() || null,
  companyId: d.companyId || null,
  ownerId: d.ownerId || null,
  nextAction: d.nextAction.trim() || null,
  nextActionDue: d.nextActionDue || null,
});

/** The inputs both the new-customer form and a customer's page edit. */
export function CustomerFieldInputs({ w, b, draft, onEdit, companies, current, onCompany, owners }: {
  w: string;
  b: string;
  draft: FieldsDraft;
  onEdit(patch: Partial<FieldsDraft>): void;
  companies: CompanyDto[] | null;
  current?: { id: string; name: string } | null;
  onCompany(c: CompanyDto): void;
  owners: readonly Owner[];
}) {
  // An owner the members list lacks (or before it loads) still shows as the pick.
  const ownerList = draft.ownerId && !owners.some((o) => o.id === draft.ownerId) ? [...owners, { id: draft.ownerId, name: "Another member" }] : owners;
  return (
    <div className="grid gap-4 @lg:grid-cols-2">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">Name</span>
        <Input value={draft.displayName} onChange={(e) => onEdit({ displayName: e.target.value })} maxLength={CRM_LIMITS.name} required />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">Role (optional)</span>
        <Input value={draft.role} onChange={(e) => onEdit({ role: e.target.value })} maxLength={CRM_LIMITS.role} placeholder="Interior designer" />
      </label>
      <CompanyField w={w} b={b} value={draft.companyId} onChange={(companyId) => onEdit({ companyId })} companies={companies} current={current} onCreated={onCompany} />
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">Language (optional)</span>
        <Input value={draft.language} onChange={(e) => onEdit({ language: e.target.value })} maxLength={CRM_LIMITS.language} placeholder="fr, en-GB" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-muted-foreground">Owner</span>
        <select className={cn(selectClass, "pointer-coarse:h-11")} value={draft.ownerId} onChange={(e) => onEdit({ ownerId: e.target.value })}>
          <option value="">Nobody yet</option>
          {ownerList.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 @lg:col-span-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Next action (optional)</span>
          <Input value={draft.nextAction} onChange={(e) => onEdit({ nextAction: e.target.value })} maxLength={CRM_LIMITS.nextAction} placeholder="Send fabric samples" />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Due</span>
          <Input type="date" value={draft.nextActionDue} onChange={(e) => onEdit({ nextActionDue: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });

/** The customer's conversations, each opening on the Follow-ups tab: only for inbox.read holders (`null` otherwise, and the page says who sees them). */
export function CustomerConversations({ conversations }: { conversations: ConversationRow[] | null }) {
  let body: React.ReactNode;
  if (conversations === null) body = <p className="text-sm text-muted-foreground">Conversations are visible to the inbox team.</p>;
  else if (!conversations.length) body = <p className="text-sm text-muted-foreground">No conversations yet.</p>;
  else
    body = (
      <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
        {conversations.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <span className="min-w-0 break-words">
              <CrmLink href={crmHref("follow-ups", { c: c.id })} className="font-medium">
                {c.subject ?? CHANNEL_LABEL[c.channel]}
              </CrmLink>
              <span className="text-muted-foreground"> · {CHANNEL_LABEL[c.channel]}</span>
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              <StatusBadge tone={stateTone(c.state)}>{FOLLOW_UP_STATE_LABEL[c.state]}</StatusBadge>
              {c.overdue ? <StatusBadge tone="bad">Overdue</StatusBadge> : null}
              <time dateTime={c.lastMessageAt}>{SHORT_DATE.format(new Date(c.lastMessageAt))}</time>
            </span>
          </li>
        ))}
      </ul>
    );
  return (
    <section aria-labelledby="customer-conversations-h" className="flex flex-col gap-2">
      <h3 id="customer-conversations-h" className="text-xs font-medium text-muted-foreground">
        Conversations
      </h3>
      {body}
    </section>
  );
}

/** The customer's deals, each a link to it on the Pipeline tab. */
export function CustomerDeals({ deals }: { deals: CustomerDto["deals"] }) {
  return (
    <section aria-labelledby="customer-deals-h" className="flex flex-col gap-2">
      <h3 id="customer-deals-h" className="text-xs font-medium text-muted-foreground">
        Deals
      </h3>
      {deals.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
          {deals.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <CrmLink href={crmHref("pipeline", { deal: d.id })} className="min-w-0 break-words font-medium">
                {d.title}
              </CrmLink>
              <span className="flex items-center gap-2">
                {d.value ? (
                  <span className="tabular-nums">
                    {d.value} {d.currency ?? ""}
                  </span>
                ) : null}
                <StatusBadge tone={d.stage === "WON" ? "good" : d.stage === "LOST" ? "muted" : "info"}>{DEAL_STAGE_LABEL[d.stage]}</StatusBadge>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No deals yet. Add one on the Pipeline tab.</p>
      )}
    </section>
  );
}

/** The customer's quotes, each a link to it on the Quotes tab. */
export function CustomerQuotes({ quotes }: { quotes: CustomerDto["quotes"] }) {
  return (
    <section aria-labelledby="customer-quotes-h" className="flex flex-col gap-2">
      <h3 id="customer-quotes-h" className="text-xs font-medium text-muted-foreground">
        Quotes
      </h3>
      {quotes.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
          {quotes.map((q) => (
            <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <CrmLink href={crmHref("quotes", { quote: q.id })} className="font-medium">
                {q.number}
              </CrmLink>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">
                  {q.total} {q.currency}
                </span>
                <StatusBadge status={q.status}>{QUOTE_STATUS_LABEL[q.status as QuoteStatus] ?? q.status}</StatusBadge>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No quotes yet. A quote&rsquo;s Customer line links it here.</p>
      )}
    </section>
  );
}

/**
 * One customer (read by id: a linked customer may be past the list's loaded pages). Field edits save on the
 * `updatedAt` read (409 `crm.changed` offers a reload); contact details, notes, quotes and conversations below.
 */
export function CustomerPage({ sectionId, w, b, id, name, access, companies, onCompany, owners, onSaved, onOpen, onMerged, onErased, onCompanyErased }: {
  sectionId: string;
  w: string;
  b: string;
  id: string;
  /** The list row's name, for the heading while the customer loads. */
  name: string | null;
  companies: CompanyDto[] | null;
  onCompany(c: CompanyDto): void;
  owners: readonly Owner[];
  onSaved(c: CustomerDto): void;
  onOpen(id: string): void;
  access: CrmAccess;
  /** `otherId` was merged into this customer and is gone. */
  onMerged(c: CustomerDto, otherId: string): void;
  onErased(): void;
  onCompanyErased(): void;
}) {
  const [merging, setMerging] = useState(false);
  const [customer, setCustomer] = useState<CustomerDto | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [draft, setDraft] = useState<FieldsDraft>(draftOf());
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);

  const load = useCallback(
    (fresh: boolean) => {
      setFailed(null);
      crmApi.customer(w, b, id).then(
        ({ customer: c }) => {
          setCustomer(c);
          if (fresh) {
            setDraft(draftOf(c));
            setDirty(false);
            setError(null);
          }
        },
        (e: unknown) => setFailed(errorMessage(e, "Couldn't load this customer. Try again.")),
      );
    },
    [w, b, id],
  );
  useEffect(() => load(true), [load]);

  // A change elsewhere on the page (contact details, notes): the customer as the server has it now, the form kept.
  const changed = (c: CustomerDto) => {
    setCustomer(c);
    onSaved(c);
  };
  const save = async () => {
    if (!customer) return;
    setBusy(true);
    setError(null);
    try {
      const { customer: c } = await crmApi.updateCustomer(w, b, id, { ...fieldsBody(draft), updatedAt: customer.updatedAt });
      changed(c);
      setDraft(draftOf(c));
      setDirty(false);
    } catch (e) {
      setError({ message: errorMessage(e), stale: e instanceof ApiError && e.code === "crm.changed" });
    } finally {
      setBusy(false);
    }
  };

  let body: React.ReactNode;
  if (failed) body = <LoadFailed what="this customer" message={failed} onRetry={() => load(true)} />;
  else if (!customer) body = <ListSkeleton label="Loading the customer" rows={2} />;
  else
    body = (
      <div className="@container flex min-w-0 flex-col gap-5">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <CustomerFieldInputs
            w={w}
            b={b}
            draft={draft}
            onEdit={(patch) => (setDraft((d) => ({ ...d, ...patch })), setDirty(true))}
            companies={companies}
            current={customer.company}
            onCompany={onCompany}
            owners={owners}
          />
          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              <span>{error.message}</span>
              {error.stale ? (
                <Button type="button" size="sm" variant="outline" onClick={() => load(true)}>
                  Reload the customer
                </Button>
              ) : null}
            </div>
          ) : null}
          <Button type="submit" className="self-start" disabled={busy || !dirty || !draft.displayName.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </form>
        <Identities w={w} b={b} customer={customer} onChange={changed} onOpen={onOpen} />
        <Notes w={w} b={b} customer={customer} owners={owners} onChanged={() => load(false)} />
        <CustomerQuotes quotes={customer.quotes} />
        <CustomerDeals deals={customer.deals} />
        <div className="flex flex-col gap-2">
          <CustomerConversations conversations={customer.conversations} />
          {access.inbox ? <LogConversation w={w} b={b} customerId={customer.id} onLogged={() => load(false)} /> : null}
        </div>
        {access.admin ? <CustomerData w={w} b={b} customer={customer} onErased={onErased} onCompanyErased={() => (onCompanyErased(), load(false))} /> : null}
        {merging ? (
          <MergeDialog
            w={w}
            b={b}
            customer={customer}
            onClose={() => setMerging(false)}
            onMerged={(c, otherId) => {
              setMerging(false);
              changed(c);
              onMerged(c, otherId);
            }}
          />
        ) : null}
      </div>
    );

  const meta = customer ? [customer.role, customer.company?.name].filter(Boolean).join(" · ") : null;
  return (
    <PageSection
      id={sectionId}
      title={customer?.displayName ?? name ?? "Customer"}
      description={meta || undefined}
      actions={
        customer ? (
          <Button size="sm" variant="outline" onClick={() => setMerging(true)}>
            Merge a duplicate
          </Button>
        ) : undefined
      }
    >
      {body}
    </PageSection>
  );
}
