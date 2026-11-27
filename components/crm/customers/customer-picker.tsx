"use client";

import { useState } from "react";
import { CRM_LIMITS, type CustomerRow } from "@/shared";
import { searchResults, useCustomerSearch } from "@/components/crm/customers/search";
import { Input } from "@/components/ui/input";

/**
 * Find a customer by name, email or phone (from CRM_LIMITS.searchMin characters) and pick one. `exclude`: an id not
 * to offer (the customer being merged into).
 */
export function CustomerPicker({ w, b, label, exclude, onPick }: { w: string; b: string; label: string; exclude?: string; onPick(c: CustomerRow): void }) {
  const [typed, setTyped] = useState("");
  const search = useCustomerSearch(w, b, typed);
  const found = (searchResults(search) ?? []).filter((c) => c.id !== exclude);
  return (
    <div className="flex flex-col gap-2 text-sm">
      <Input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name, email or phone" aria-label={label} maxLength={100} />
      <p className="text-xs text-muted-foreground" role="status">
        {search.kind === "idle" ? `Type at least ${CRM_LIMITS.searchMin} characters.` : search.kind === "loading" ? "Searching…" : search.kind === "ready" && !found.length ? "No customer matches that." : null}
      </p>
      {search.kind === "error" ? (
        <p className="text-destructive" role="alert">
          {search.message}
        </p>
      ) : null}
      {found.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
          {found.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted pointer-coarse:py-3" onClick={() => (onPick(c), setTyped(""))}>
                <span className="min-w-0 truncate">{c.displayName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{c.company?.name ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
