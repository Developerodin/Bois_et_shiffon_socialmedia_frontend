"use client";

import { useState } from "react";
import { CRM_LIMITS, type CustomerDto } from "@/shared";
import { crmApi } from "@/components/crm/api";
import { ownerName, type Owner } from "@/components/crm/customers/people";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const WHEN = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

/**
 * The team's notes on a customer, newest first. Append-only: a person can delete their own note in its first 24 hours
 * (`deletable`). A note changes the customer's activity, so the page reads the customer again after each change.
 */
export function Notes({ w, b, customer, owners, onChanged }: { w: string; b: string; customer: CustomerDto; owners: readonly Owner[]; onChanged(): void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const call = async (what: string, fn: () => Promise<unknown>) => {
    setBusy(what);
    setError(null);
    try {
      await fn();
      if (what === "add") setText("");
      onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-labelledby="customer-notes-h" className="flex flex-col gap-2">
      <h3 id="customer-notes-h" className="text-xs font-medium text-muted-foreground">
        Notes for the team
      </h3>
      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) void call("add", () => crmApi.addNote(w, b, customer.id, text.trim()));
        }}
      >
        <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={CRM_LIMITS.note} rows={2} aria-label="New note" placeholder="What the team should know" />
        <Button type="submit" size="sm" variant="outline" className="self-start" disabled={!!busy || !text.trim()}>
          {busy === "add" ? "Adding…" : "Add note"}
        </Button>
      </form>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {customer.notes.length ? (
        <ul className="flex flex-col gap-2 text-sm">
          {customer.notes.map((n) => (
            <li key={n.id} className="flex flex-col gap-1 rounded-xl border border-border px-3 py-2">
              <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>
                  {n.mine ? "You" : (ownerName(owners, n.authorId) ?? "Someone")} · <time dateTime={n.createdAt}>{WHEN.format(new Date(n.createdAt))}</time>
                </span>
                {n.deletable ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={!!busy}
                    onClick={() => {
                      if (window.confirm("Delete this note?")) void call(n.id, () => crmApi.deleteNote(w, b, customer.id, n.id));
                    }}
                  >
                    {busy === n.id ? "Deleting…" : "Delete"}
                  </Button>
                ) : null}
              </span>
              <p className="whitespace-pre-wrap break-words">{n.text}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No notes yet.</p>
      )}
    </section>
  );
}
