"use client";

import { useCallback, useEffect, useState } from "react";
import { Building2 } from "lucide-react";
import { CRM_LIMITS, type CompanyDto, type CustomerRow } from "@/shared";
import { crmApi } from "@/components/crm/api";
import { OwnerSelect } from "@/components/crm/customers/owner-select";
import { ownerName, type Owner } from "@/components/crm/customers/people";
import { ApiError, errorMessage } from "@/components/settings/api";
import { ListSkeleton } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ListCard, ListDetail, ListRow, useListSelection } from "@/components/ui/list-detail";
import { LoadFailed } from "@/components/ui/load-failed";
import { PageSection } from "@/components/ui/page-section";

/** A company's editable fields as typed (empty means none). */
export type CompanyDraft = { name: string; website: string; ownerId: string };
export const companyDraft = (c: CompanyDto): CompanyDraft => ({ name: c.name, website: c.website ?? "", ownerId: c.ownerId ?? "" });
/** The draft as sent: trimmed, and an empty website or owner as null (cleared). */
export const companyBody = (d: CompanyDraft) => ({ name: d.name.trim(), website: d.website.trim() || null, ownerId: d.ownerId || null });
/** The server takes only an http(s) address; say so before Save. */
export function websiteProblem(website: string): string | null {
  const v = website.trim();
  if (!v) return null;
  try {
    if (["http:", "https:"].includes(new URL(v).protocol)) return null;
  } catch {
    // not a URL at all
  }
  return "A website starts with http:// or https://";
}
export const customersLabel = (n: number) => `${n.toLocaleString("en")} ${n === 1 ? "customer" : "customers"}`;

/**
 * The Companies view of the Customers tab (crm.manage): the business's companies by name, each with its customer
 * count, and one company beside the list. `companies` null: still loading (`failed`: the read failed).
 */
export function CompaniesView({ w, b, companies, failed, onRetry, owners, onSaved, onOpenCustomer }: {
  w: string;
  b: string;
  companies: CompanyDto[] | null;
  failed: boolean;
  onRetry(): void;
  owners: readonly Owner[];
  onSaved(c: CompanyDto): void;
  onOpenCustomer(id: string): void;
}) {
  const { selected, open, ids } = useListSelection({ item: "company", list: "companies-list", emptyHeadingId: "companies-empty-h" });
  const current = companies?.find((c) => c.id === selected) ?? null;

  if (failed) return <LoadFailed what="the companies" onRetry={onRetry} />;
  if (!companies) return <ListSkeleton label="Loading companies" rows={3} />;
  if (!companies.length)
    return (
      <EmptyState
        icon={Building2}
        title="No companies yet"
        headingId={ids.emptyHeading}
        description="A company groups the customers who buy together, such as a design studio or a trade buyer. Add one from a customer's Company field."
      />
    );
  return (
    <ListDetail
      list={
        <ListCard id={ids.list} title="All companies" description="By name">
          {companies.map((c) => (
            <ListRow key={c.id} selected={c.id === selected} onSelect={() => open(c.id)} className="flex-col gap-1">
              <span className="w-full truncate font-medium">{c.name}</span>
              <span className="w-full truncate text-xs text-muted-foreground">{[customersLabel(c.customers), ownerName(owners, c.ownerId)].filter(Boolean).join(" · ")}</span>
            </ListRow>
          ))}
        </ListCard>
      }
      detail={
        selected ? (
          <CompanyPage key={selected} sectionId={ids.item} w={w} b={b} id={selected} name={current?.name ?? null} owners={owners} onSaved={onSaved} onOpenCustomer={onOpenCustomer} />
        ) : null
      }
      placeholder={<EmptyState variant="card" icon={Building2} title="No company open" description="Pick a company to change its name, website or owner and see its customers." />}
    />
  );
}

/** One company (read by id): its fields, saved on the `updatedAt` read (409 `crm.changed` offers a reload), and its customers. */
function CompanyPage({ sectionId, w, b, id, name, owners, onSaved, onOpenCustomer }: {
  sectionId: string;
  w: string;
  b: string;
  id: string;
  /** The list row's name, for the heading while the company loads. */
  name: string | null;
  owners: readonly Owner[];
  onSaved(c: CompanyDto): void;
  onOpenCustomer(id: string): void;
}) {
  const [company, setCompany] = useState<CompanyDto | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [draft, setDraft] = useState<CompanyDraft>({ name: "", website: "", ownerId: "" });
  const [dirty, setDirty] = useState(false);
  // `base`: the updatedAt the draft was taken from, sent on Save, so a colleague's save in between is a 409.
  const [base, setBase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; stale: boolean } | null>(null);

  const adopt = (c: CompanyDto) => {
    setCompany(c);
    setDraft(companyDraft(c));
    setBase(c.updatedAt);
    setDirty(false);
  };
  const load = useCallback(() => {
    setFailed(null);
    setError(null);
    crmApi.company(w, b, id).then(
      (r) => adopt(r.company),
      (e: unknown) => setFailed(errorMessage(e, "Couldn't load this company. Try again.")),
    );
  }, [w, b, id]);
  useEffect(load, [load]);

  const problem = websiteProblem(draft.website);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { company: c } = await crmApi.updateCompany(w, b, id, { ...companyBody(draft), updatedAt: base });
      adopt(c);
      onSaved(c);
    } catch (e) {
      setError({ message: errorMessage(e), stale: e instanceof ApiError && e.code === "crm.changed" });
    } finally {
      setBusy(false);
    }
  };
  const edit = (p: Partial<CompanyDraft>) => (setDraft((d) => ({ ...d, ...p })), setDirty(true));

  let body: React.ReactNode;
  if (failed) body = <LoadFailed what="this company" message={failed} onRetry={load} />;
  else if (!company) body = <ListSkeleton label="Loading the company" rows={2} />;
  else
    body = (
      <div className="@container flex min-w-0 flex-col gap-5">
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!problem && draft.name.trim()) void save();
          }}
        >
          <div className="grid gap-4 @lg:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Name</span>
              <Input value={draft.name} onChange={(e) => edit({ name: e.target.value })} maxLength={CRM_LIMITS.name} required />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted-foreground">Website (optional)</span>
              <Input
                type="url"
                value={draft.website}
                onChange={(e) => edit({ website: e.target.value })}
                maxLength={CRM_LIMITS.website}
                placeholder="https://"
                aria-invalid={problem ? true : undefined}
                aria-describedby={problem ? "company-website-problem" : undefined}
              />
            </label>
            <OwnerSelect value={draft.ownerId} onChange={(ownerId) => edit({ ownerId })} owners={owners} />
          </div>
          {problem ? (
            <p id="company-website-problem" className="text-sm text-destructive">
              {problem}
            </p>
          ) : null}
          {error ? (
            <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive">
              <span>{error.message}</span>
              {error.stale ? (
                <Button type="button" size="sm" variant="outline" onClick={load}>
                  Reload the company
                </Button>
              ) : null}
            </div>
          ) : null}
          <Button type="submit" className="self-start" disabled={busy || !dirty || !!problem || !draft.name.trim()}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </form>
        <CompanyCustomers w={w} b={b} companyId={id} onOpen={onOpenCustomer} />
      </div>
    );

  return (
    <PageSection id={sectionId} title={company?.name ?? name ?? "Company"} description={company ? customersLabel(company.customers) : undefined}>
      {body}
    </PageSection>
  );
}

/** The company's customers, latest activity first (50 a page, Load more); each opens on the Customers view. */
function CompanyCustomers({ w, b, companyId, onOpen }: { w: string; b: string; companyId: string; onOpen(id: string): void }) {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState<"idle" | "busy" | "failed">("idle");

  const load = useCallback(() => {
    setFailed(false);
    crmApi.companyCustomers(w, b, companyId).then(
      (r) => (setRows(r.customers), setNext(r.nextCursor)),
      () => setFailed(true),
    );
  }, [w, b, companyId]);
  useEffect(load, [load]);
  const loadMore = async () => {
    if (!next) return;
    setMore("busy");
    try {
      const r = await crmApi.companyCustomers(w, b, companyId, next);
      setRows((list) => [...(list ?? []), ...r.customers.filter((c) => !(list ?? []).some((x) => x.id === c.id))]);
      setNext(r.nextCursor);
      setMore("idle");
    } catch {
      setMore("failed");
    }
  };

  let body: React.ReactNode;
  if (failed) body = <LoadFailed what="the company's customers" onRetry={load} />;
  else if (!rows) body = <ListSkeleton label="Loading the company's customers" rows={2} />;
  else if (!rows.length) body = <p className="text-sm text-muted-foreground">No customers yet. Pick this company in a customer&rsquo;s Company field.</p>;
  else
    body = (
      <>
        <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
          {rows.map((c) => (
            <li key={c.id}>
              <button type="button" className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted pointer-coarse:py-3" onClick={() => onOpen(c.id)}>
                <span className="min-w-0 truncate font-medium">{c.displayName}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{c.role ?? ""}</span>
              </button>
            </li>
          ))}
        </ul>
        {next ? (
          <div>
            <Button size="sm" variant="outline" disabled={more === "busy"} onClick={() => void loadMore()}>
              {more === "busy" ? "Loading…" : "Load more"}
            </Button>
            {more === "failed" ? (
              <span className="ml-2 text-sm text-destructive" role="alert">
                Couldn&rsquo;t load more. Try again.
              </span>
            ) : null}
          </div>
        ) : null}
      </>
    );
  return (
    <section aria-labelledby="company-customers-h" className="flex flex-col gap-2">
      <h3 id="company-customers-h" className="text-xs font-medium text-muted-foreground">
        Customers
      </h3>
      {body}
    </section>
  );
}
