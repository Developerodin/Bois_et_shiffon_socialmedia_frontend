"use client";

import { useState } from "react";
import { CRM_LIMITS, type QuoteDto } from "@/shared";
import { crmApi, identityConflict } from "@/components/crm/api";
import { CrmLink, crmHref } from "@/components/crm/crm-link";
import type { Clash } from "@/components/crm/customers/identities";
import { useCustomerSearch } from "@/components/crm/customers/search";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [typed, setTyped] = useState("");
  const search = useCustomerSearch(w, b, picking ? typed : "");

  const call = async (what: string, body: { customerId: string | null } | { create: true }) => {
    setBusy(what);
    setError(null);
    setClash(null);
    try {
      onChange((await crmApi.quoteCustomer(w, b, quote.id, body)).quote);
      setPicking(false);
      setTyped("");
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
      {picking && !quote.customerId ? (
        <div className="flex flex-col gap-2">
          <Input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name, email or phone" aria-label="Find a customer" maxLength={100} autoFocus />
          <p className="text-xs text-muted-foreground" role="status">
            {search.kind === "idle" ? `Type at least ${CRM_LIMITS.searchMin} characters.` : search.kind === "loading" ? "Searching…" : search.kind === "ready" && !search.customers.length ? "No customer matches that." : null}
          </p>
          {search.kind === "error" ? (
            <p className="text-destructive" role="alert">
              {search.message}
            </p>
          ) : null}
          {search.kind === "ready" && search.customers.length ? (
            <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
              {search.customers.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    disabled={off}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted disabled:opacity-50 pointer-coarse:py-3"
                    onClick={() => void call(c.id, { customerId: c.id })}
                  >
                    <span className="min-w-0 truncate">{c.displayName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.company?.name ?? ""}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
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
