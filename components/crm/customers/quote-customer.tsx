"use client";

import { useState } from "react";
import type { QuoteDto } from "@/shared";
import { crmApi, identityConflict } from "@/components/crm/api";
import { CrmLink, crmHref } from "@/components/crm/crm-link";
import type { Clash } from "@/components/crm/customers/identities";
import { CustomerPicker } from "@/components/crm/customers/customer-picker";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";

/**
 * The quote editor's Customer line: open the linked customer (or unlink), save the quote's contact as a new customer,
 * or link to one found by search. A contact whose email is already a customer's gets a button to link to them instead.
 * `disabled` while the editor has unsaved changes (the quote comes back from the server and replaces the form).
 */
export function QuoteCustomer({ w, b, quote, disabled, onChange }: { w: string; b: string; quote: QuoteDto; disabled: boolean; onChange(q: QuoteDto): void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);
  const [picking, setPicking] = useState(false);

  const call = async (what: string, body: { customerId: string | null } | { create: true }) => {
    setBusy(what);
    setError(null);
    setClash(null);
    try {
      onChange((await crmApi.quoteCustomer(w, b, quote.id, body)).quote);
      setPicking(false);
    } catch (e) {
      const c = identityConflict(e);
      if (c) setClash(c);
      else setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const off = disabled || !!busy;

  return (
    <section aria-labelledby="quote-customer-h" className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm">
      <h3 id="quote-customer-h" className="text-xs font-medium text-muted-foreground">
        Customer
      </h3>
      {quote.customerId ? (
        <div className="flex flex-wrap items-center gap-2">
          <span>Linked to a customer record.</span>
          <CrmLink href={crmHref("customers", { customer: quote.customerId })} className="font-medium">
            Open the customer
          </CrmLink>
          <Button size="sm" variant="ghost" disabled={off} onClick={() => void call("unlink", { customerId: null })}>
            {busy === "unlink" ? "Unlinking…" : "Unlink"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">Not linked to a customer.</span>
          <Button size="sm" variant="outline" disabled={off || !quote.contactName} aria-describedby={!quote.contactName ? "quote-customer-hint" : undefined} onClick={() => void call("create", { create: true })}>
            {busy === "create" ? "Saving…" : "Save as customer"}
          </Button>
          <Button size="sm" variant="outline" disabled={off} aria-expanded={picking} onClick={() => setPicking((p) => !p)}>
            Link to a customer
          </Button>
          {!quote.contactName ? (
            <span id="quote-customer-hint" className="basis-full text-xs text-muted-foreground">
              Saving as a customer needs the contact&rsquo;s name on the quote.
            </span>
          ) : null}
        </div>
      )}
      {disabled ? <p className="text-xs text-muted-foreground">Save the quote first.</p> : null}
      {picking && !quote.customerId ? <CustomerPicker w={w} b={b} label="Find a customer" onPick={(c) => void call(c.id, { customerId: c.id })} /> : null}
      {clash ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-destructive">
          <span>{clash.message}</span>
          {clash.customerId ? (
            <Button size="sm" variant="outline" disabled={off} onClick={() => void call("link", { customerId: clash.customerId })}>
              Link to {clash.customerName ?? "that customer"}
            </Button>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
