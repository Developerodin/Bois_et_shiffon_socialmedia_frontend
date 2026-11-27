"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { CRM_LIMITS, type CompanyDto } from "@/shared";
import { crmApi } from "@/components/crm/api";
import { errorMessage } from "@/components/settings/api";
import { selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * The customer's company: a pick from the business's companies, or "New company" to add one by name and pick it.
 * Not a form of its own (it sits inside the customer's form): Enter in the name field adds the company.
 * `companies` null: still loading (or failed), so only the current pick shows.
 */
export function CompanyField({ w, b, value, onChange, companies, current, onCreated }: {
  w: string;
  b: string;
  value: string;
  onChange(id: string): void;
  companies: CompanyDto[] | null;
  /** The customer's company as read, for when the list hasn't loaded. */
  current?: { id: string; name: string } | null;
  onCreated(c: CompanyDto): void;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = companies ?? (current ? [current] : []);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { company } = await crmApi.createCompany(w, b, { name: name.trim() });
      onCreated(company);
      onChange(company.id);
      setAdding(false);
      setName("");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <label className="flex flex-col gap-1.5">
        <span className="text-muted-foreground">Company</span>
        <select className={cn(selectClass, "pointer-coarse:h-11")} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">No company</option>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {adding ? (
        <div className="flex flex-wrap gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void add();
              }
            }}
            maxLength={CRM_LIMITS.name}
            aria-label="New company's name"
            placeholder="Company name"
            className="min-w-0 flex-1"
            autoFocus
          />
          <Button type="button" size="sm" disabled={busy || !name.trim()} onClick={() => void add()}>
            {busy ? "Adding…" : "Add"}
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => (setAdding(false), setError(null))}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => setAdding(true)}>
          <Plus aria-hidden="true" />
          New company
        </Button>
      )}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
