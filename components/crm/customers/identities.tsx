"use client";

import { useState } from "react";
import { CRM_LIMITS, MANUAL_IDENTITY_KINDS, type CustomerDto, type IdentityKind } from "@/shared";
import { crmApi, identityConflict } from "@/components/crm/api";
import { errorMessage } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export const IDENTITY_LABEL: Record<IdentityKind, string> = { EMAIL: "Email", PHONE: "Phone", INSTAGRAM: "Instagram", MESSENGER: "Messenger", SHOPIFY: "Shopify" };

/** What a person sees when a contact detail is already another customer's: the server's line, and who has it. */
export type Clash = { message: string; customerId: string | null; customerName: string | null };

/** The clash line with a button to open the customer who has the detail (when the server names one). */
export function ClashNotice({ clash, selfId, onOpen }: { clash: Clash; selfId?: string; onOpen(id: string): void }) {
  const other = clash.customerId && clash.customerId !== selfId ? clash.customerId : null;
  return (
    <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
      <span>{clash.message}</span>
      {other ? (
        <Button type="button" size="sm" variant="outline" onClick={() => onOpen(other)}>
          Open {clash.customerName ?? "that customer"}
        </Button>
      ) : null}
    </div>
  );
}

/** A customer's contact details: email and phone by hand (channel ids come with the inbox), each unique per business. */
export function Identities({ w, b, customer, onChange, onOpen }: { w: string; b: string; customer: CustomerDto; onChange(c: CustomerDto): void; onOpen(id: string): void }) {
  const [kind, setKind] = useState<(typeof MANUAL_IDENTITY_KINDS)[number]>("EMAIL");
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);

  const call = async (what: string, fn: () => Promise<{ customer: CustomerDto }>) => {
    setBusy(what);
    setError(null);
    setClash(null);
    try {
      onChange((await fn()).customer);
      if (what === "add") setValue("");
    } catch (e) {
      const c = identityConflict(e);
      if (c) setClash(c);
      else setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="customer-identities-h" className="flex flex-col gap-2">
      <h3 id="customer-identities-h" className="text-xs font-medium text-muted-foreground">
        Contact details
      </h3>
      {customer.identities.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
          {customer.identities.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-1.5">
              <span className="min-w-0 break-words">
                <span className="text-muted-foreground">{IDENTITY_LABEL[i.kind]}: </span>
                {i.value}
              </span>
              {(MANUAL_IDENTITY_KINDS as readonly string[]).includes(i.kind) ? (
                <Button size="sm" variant="ghost" disabled={!!busy} aria-label={`Remove ${IDENTITY_LABEL[i.kind].toLowerCase()} ${i.value}`} onClick={() => void call(i.id, () => crmApi.removeIdentity(w, b, customer.id, i.id))}>
                  {busy === i.id ? "Removing…" : "Remove"}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No email or phone yet.</p>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (value.trim()) void call("add", () => crmApi.addIdentity(w, b, customer.id, { kind, value: value.trim() }));
        }}
      >
        <select className={cn(selectClass, "w-auto pointer-coarse:h-11")} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} aria-label="Kind of contact detail">
          {MANUAL_IDENTITY_KINDS.map((k) => (
            <option key={k} value={k}>
              {IDENTITY_LABEL[k]}
            </option>
          ))}
        </select>
        <Input
          className="min-w-0 flex-1"
          type={kind === "EMAIL" ? "email" : "tel"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={CRM_LIMITS.identity}
          aria-label={kind === "EMAIL" ? "Email address" : "Phone number"}
        />
        <Button type="submit" size="sm" variant="outline" disabled={!!busy || !value.trim()}>
          {busy === "add" ? "Adding…" : "Add"}
        </Button>
      </form>
      {clash ? <ClashNotice clash={clash} selfId={customer.id} onOpen={onOpen} /> : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
