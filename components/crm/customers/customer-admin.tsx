"use client";

import { useEffect, useState } from "react";
import type { CustomerDto, CustomerRow } from "@/shared";
import { crmApi } from "@/components/crm/api";
import { CustomerPicker } from "@/components/crm/customers/customer-picker";
import { ApiError, errorMessage } from "@/components/settings/api";
import { ConfirmDialog } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { downloadFile } from "@/lib/download";

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** What a merge moves from `other` to the customer kept, in words ("2 contact details, 1 note and 3 quotes"). */
export function mergeMoves(other: Pick<CustomerDto, "identities" | "notes" | "quotes" | "deals" | "conversations">): string {
  const parts = [
    count(other.identities.length, "contact detail", "contact details"),
    count(other.notes.length, "note", "notes"),
    count(other.quotes.length, "quote", "quotes"),
    count(other.deals.length, "deal", "deals"),
    // Without inbox.read the count isn't shown, but they move all the same.
    other.conversations === null ? "their conversations" : count(other.conversations.length, "conversation", "conversations"),
  ];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/**
 * Merge a duplicate into this customer (kept): pick a same-name suggestion or search any customer, see what moves,
 * then confirm. Both are sent as read (409 when either changed in between). No undo.
 */
export function MergeDialog({ w, b, customer, onClose, onStale, onMerged }: {
  w: string;
  b: string;
  customer: CustomerDto;
  onClose(): void;
  /** Either customer changed since it was read: the page reads this one again. */
  onStale(): void;
  onMerged(c: CustomerDto, otherId: string): void;
}) {
  const [suggestions, setSuggestions] = useState<CustomerRow[] | null>(null);
  const [other, setOther] = useState<CustomerDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    crmApi.mergeSuggestions(w, b, customer.id).then(
      (r) => setSuggestions(r.suggestions),
      () => setSuggestions([]),
    );
  }, [w, b, customer.id]);
  const pick = (id: string) => {
    setError(null);
    setOther(null);
    crmApi.customer(w, b, id).then(
      (r) => setOther(r.customer),
      (e: unknown) => setError(errorMessage(e)),
    );
  };
  const merge = async () => {
    if (!other) return;
    setBusy(true);
    setError(null);
    try {
      const { customer: kept } = await crmApi.merge(w, b, customer.id, { otherId: other.id, survivorUpdatedAt: customer.updatedAt, otherUpdatedAt: other.updatedAt });
      onMerged(kept, other.id);
    } catch (e) {
      if (e instanceof ApiError && e.code === "crm.changed") {
        // Both are read again: this one by the page, the other on the next pick.
        onStale();
        setOther(null);
        setError("One of the two customers changed in the meantime. Pick the duplicate again to see them as they are now.");
      } else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Merge a duplicate into {customer.displayName}</DialogTitle>
          <DialogDescription>{customer.displayName} is kept. The other customer&rsquo;s details, notes, conversations, deals and quotes move here, and the other record is deleted.</DialogDescription>
        </DialogHeader>
        {other ? (
          <div className="flex flex-col gap-2 text-sm">
            <p>
              <span className="font-medium">{other.displayName}</span>
              {other.company ? <span className="text-muted-foreground"> · {other.company.name}</span> : null}
            </p>
            <p>Moves to {customer.displayName}: {mergeMoves(other)}. Fields empty here take theirs.</p>
            <p className="font-medium">This can&rsquo;t be undone.</p>
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setOther(null)} disabled={busy}>
              Pick someone else
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            {suggestions === null ? (
              <p className="text-muted-foreground" role="status">
                Looking for customers with the same name…
              </p>
            ) : suggestions.length ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-muted-foreground">Same name:</p>
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                  {suggestions.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted pointer-coarse:py-3" onClick={() => pick(s.id)}>
                        <span className="min-w-0 truncate">{s.displayName}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{s.company?.name ?? ""}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-muted-foreground">No other customer has the same name.</p>
            )}
            <CustomerPicker w={w} b={b} label="Find the duplicate" exclude={customer.id} onPick={(c) => pick(c.id)} />
          </div>
        )}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => void merge()} disabled={busy || !other}>
            {busy ? "Merging…" : "Merge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const ERASE_CUSTOMER =
  "This deletes the customer with their contact details, notes, conversations and messages. Their deals, and deals tied to them only through one of their conversations, stay, renamed and without next actions or notes. Their quotes stay for the books, with the contact's name and email, the notes, the declined reason, the invoice link and the titles of free lines removed, and the same for the quotes' earlier versions. It can't be undone.";
export const ERASE_COMPANY =
  "This deletes the company. Its customers stay, without the company. Its deals stay, renamed and without next actions or notes. It can't be undone.";

/**
 * A customer's data rights (GDPR Art. 15 and 17), for workspace owners and admins (members.manage) holding crm.manage:
 * download everything held as JSON, erase the customer, erase their company. The server checks the same and limits
 * both to 10 an hour.
 */
export function CustomerData({ w, b, customer, onErased, onCompanyErased }: { w: string; b: string; customer: CustomerDto; onErased(): void; onCompanyErased(): void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"customer" | "company" | null>(null);
  const company = customer.company;
  return (
    <section aria-labelledby="customer-data-h" className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm">
      <h3 id="customer-data-h" className="text-xs font-medium text-muted-foreground">
        Their data (owners and admins)
      </h3>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await downloadFile(crmApi.exportUrl(w, b, customer.id), `customer-${customer.id}.json`);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Preparing…" : "Download their data"}
        </Button>
        <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirm("customer")}>
          Erase this customer
        </Button>
        {customer.company ? (
          <Button size="sm" variant="outline" className="text-destructive" onClick={() => setConfirm("company")}>
            Erase the company {customer.company.name}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <ConfirmDialog
        open={confirm === "customer"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={`Erase ${customer.displayName}?`}
        description={ERASE_CUSTOMER}
        confirmLabel="Erase the customer"
        onConfirm={async () => {
          await crmApi.eraseCustomer(w, b, customer.id);
          onErased();
        }}
      />
      {company ? (
        <ConfirmDialog
          open={confirm === "company"}
          onOpenChange={(o) => !o && setConfirm(null)}
          title={`Erase the company ${company.name}?`}
          description={ERASE_COMPANY}
          confirmLabel="Erase the company"
          onConfirm={async () => {
            await crmApi.eraseCompany(w, b, company.id);
            onCompanyErased();
          }}
        />
      ) : null}
    </section>
  );
}
