"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Users } from "lucide-react";
import { CRM_LIMITS, type CompanyDto, type CustomerDto, type CustomerRow } from "@/shared";
import { crmApi, identityConflict, type ManualIdentity } from "@/components/crm/api";
import type { CrmAccess } from "@/components/crm/crm-link";
import { CustomerFieldInputs, CustomerPage, draftOf, fieldsBody, type FieldsDraft } from "@/components/crm/customers/customer-page";
import { ClashNotice, type Clash } from "@/components/crm/customers/identities";
import { useOwners, type Owner } from "@/components/crm/customers/people";
import { useCustomerSearch } from "@/components/crm/customers/search";
import { errorMessage } from "@/components/settings/api";
import { ListSkeleton, useLoad } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { ListCard, ListDetail, ListRow, useListSelection } from "@/components/ui/list-detail";
import { LoadFailed } from "@/components/ui/load-failed";
import { focusSectionHeading, PageSection } from "@/components/ui/page-section";

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
const rowOf = (c: CustomerDto): CustomerRow => ({
  id: c.id,
  displayName: c.displayName,
  role: c.role,
  company: c.company,
  ownerId: c.ownerId,
  nextAction: c.nextAction,
  nextActionDue: c.nextActionDue,
  lastActivityAt: c.lastActivityAt,
});

/**
 * The Customers tab of /crm (crm.manage): the list (latest activity first, 50 a page, Load more), a search from 2
 * characters, a new customer, and one customer's page beside the list. `?customer=<id>` (a link from a quote) opens
 * that customer.
 */
export function CustomersTab({ w, b, access }: { w: string; b: string; access: CrmAccess }) {
  const [rows, setRows] = useState<CustomerRow[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [more, setMore] = useState<"idle" | "busy" | "failed">("idle");
  const [typed, setTyped] = useState("");
  const search = useCustomerSearch(w, b, typed);
  const [creating, setCreating] = useState(false);
  const { selected, open, closed, ids } = useListSelection({ item: "customer", list: "customers-list", emptyHeadingId: "customers-empty-h" });

  const companiesFetch = useCallback(() => crmApi.companies(w, b).then((r) => r.companies), [w, b]);
  const { state: companiesLoad, reload: reloadCompanies } = useLoad(companiesFetch);
  const [added, setAdded] = useState<CompanyDto[]>([]);
  const loadedCompanies = companiesLoad.kind === "ready" ? companiesLoad.data : null;
  const companies = loadedCompanies ? [...added.filter((c) => !loadedCompanies.some((x) => x.id === c.id)), ...loadedCompanies].sort((x, y) => x.name.localeCompare(y.name)) : null;
  const owners = useOwners(w, b);

  const load = () => {
    setFailed(false);
    crmApi.customers(w, b).then(
      (r) => (setRows(r.customers), setNext(r.nextCursor)),
      () => setFailed(true),
    );
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once; the tab remounts on a brand switch
  useEffect(load, []);
  const loadMore = async () => {
    if (!next) return;
    setMore("busy");
    try {
      const r = await crmApi.customers(w, b, next);
      setRows((list) => [...(list ?? []), ...r.customers.filter((c) => !(list ?? []).some((x) => x.id === c.id))]);
      setNext(r.nextCursor);
      setMore("idle");
    } catch {
      setMore("failed");
    }
  };
  /** A saved customer moves to the top: its activity is the newest. */
  const put = (c: CustomerDto) => setRows((list) => [rowOf(c), ...(list ?? []).filter((x) => x.id !== c.id)]);
  const show = (id: string) => (setCreating(false), open(id, "always"));

  // A link from another tab (?customer=<id>): open it once per link, then the list's own clicks decide.
  const urlCustomer = useSearchParams().get("customer");
  const handled = useRef<string | null>(null);
  // After the list is in: the customer's heading has to be on the page to take focus.
  const listed = rows !== null || failed;
  useEffect(() => {
    if (!urlCustomer || !listed || handled.current === urlCustomer) return;
    handled.current = urlCustomer;
    setCreating(false);
    open(urlCustomer, "always");
  }, [urlCustomer, listed, open]);

  const searching = search.kind === "ready";
  const shown = searching ? search.customers : rows;
  const current = shown?.find((c) => c.id === selected) ?? rows?.find((c) => c.id === selected) ?? null;

  const newCustomer = (
    <Button disabled={creating} onClick={() => setCreating(true)}>
      <Plus aria-hidden="true" />
      New customer
    </Button>
  );
  const searchBox = (
    <div className="flex flex-col gap-1.5">
      <Input type="search" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Search by name, email or phone" aria-label="Search customers" aria-describedby="customers-search-hint" maxLength={100} />
      <p id="customers-search-hint" className="text-xs text-muted-foreground" role="status">
        {typed.trim().length > 0 && typed.trim().length < CRM_LIMITS.searchMin
          ? `Type at least ${CRM_LIMITS.searchMin} characters.`
          : search.kind === "loading"
            ? "Searching…"
            : search.kind === "ready"
              ? `${search.customers.length} ${search.customers.length === 1 ? "match" : "matches"}${search.customers.length >= CRM_LIMITS.searchResults ? " (the first 20)" : ""}`
              : null}
      </p>
      {search.kind === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {search.message}
        </p>
      ) : null}
    </div>
  );

  let body: React.ReactNode;
  if (failed)
    body = <LoadFailed what="the customers" onRetry={load} />;
  else if (!rows) body = <ListSkeleton label="Loading customers" rows={3} />;
  else if (!rows.length && !creating)
    body = (
      <EmptyState
        icon={Users}
        title="No customers yet"
        headingId={ids.emptyHeading}
        description="A customer record keeps a person's contact details, the team's notes and their quotes together. Add one with New customer above, or save a quote's contact as a customer from the Quotes tab."
      />
    );
  else
    body = (
      <ListDetail
        list={
          <ListCard id={ids.list} title={searching ? "Search results" : "All customers"} description={searching ? undefined : "Latest activity first"} top={searchBox}>
            {(shown ?? []).map((c) => (
              <ListRow key={c.id} selected={!creating && c.id === selected} onSelect={() => (setCreating(false), open(c.id))} className="flex-col gap-1">
                <span className="w-full truncate font-medium">{c.displayName}</span>
                <span className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">{[c.role, c.company?.name].filter(Boolean).join(" · ") || "No company"}</span>
                  <time dateTime={c.lastActivityAt} className="shrink-0">{SHORT_DATE.format(new Date(c.lastActivityAt))}</time>
                </span>
                {c.nextAction ? (
                  <span className="w-full truncate text-xs">
                    Next: {c.nextAction}
                    {c.nextActionDue ? <span className="text-muted-foreground"> · due {c.nextActionDue}</span> : null}
                  </span>
                ) : null}
              </ListRow>
            ))}
            {search.kind === "ready" && !search.customers.length ? <li className="px-5 py-3 text-sm text-muted-foreground">No customer matches that.</li> : null}
            {search.kind === "idle" && next ? (
              <li className="px-5 pt-2">
                <Button size="sm" variant="outline" disabled={more === "busy"} onClick={() => void loadMore()}>
                  {more === "busy" ? "Loading…" : "Load more"}
                </Button>
                {more === "failed" ? (
                  <span className="ml-2 text-sm text-destructive" role="alert">
                    Couldn&rsquo;t load more. Try again.
                  </span>
                ) : null}
              </li>
            ) : null}
          </ListCard>
        }
        detail={
          creating ? (
            <NewCustomer
              w={w}
              b={b}
              companies={companies}
              onCompany={(c) => setAdded((l) => [c, ...l])}
              owners={owners}
              onCancel={() => setCreating(false)}
              onCreated={(c) => (put(c), show(c.id))}
              onOpen={show}
            />
          ) : selected ? (
            <CustomerPage
              key={selected}
              sectionId={ids.item}
              w={w}
              b={b}
              id={selected}
              name={current?.displayName ?? null}
              companies={companies}
              onCompany={(c) => setAdded((l) => [c, ...l])}
              owners={owners}
              onSaved={put}
              onOpen={show}
              access={access}
              onMerged={(_c, otherId) => setRows((list) => (list ?? []).filter((x) => x.id !== otherId))}
              onErased={() => {
                setRows((list) => (list ?? []).filter((x) => x.id !== selected));
                closed();
              }}
              onCompanyErased={reloadCompanies}
            />
          ) : null
        }
        placeholder={<EmptyState variant="card" icon={Users} title="No customer open" description="Pick a customer to see their details, notes and quotes, or add a new one." />}
      />
    );

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-muted-foreground">The people the business sells to: contact details, the team&rsquo;s notes, and their quotes.</p>
        {newCustomer}
      </div>
      {body}
    </>
  );
}

/** A new customer: the fields, plus an email and a phone (each optional). A detail already on a customer is 409. */
function NewCustomer({ w, b, companies, onCompany, owners, onCancel, onCreated, onOpen }: {
  w: string;
  b: string;
  companies: CompanyDto[] | null;
  onCompany(c: CompanyDto): void;
  owners: readonly Owner[];
  onCancel(): void;
  onCreated(c: CustomerDto): void;
  onOpen(id: string): void;
}) {
  const [draft, setDraft] = useState<FieldsDraft>(draftOf());
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clash, setClash] = useState<Clash | null>(null);
  // The New customer button stays, but the form is where the work is now (below the list when stacked).
  useEffect(() => focusSectionHeading("customer-new"), []);

  const create = async () => {
    setBusy(true);
    setError(null);
    setClash(null);
    const identities: ManualIdentity[] = [];
    if (email.trim()) identities.push({ kind: "EMAIL", value: email.trim() });
    if (phone.trim()) identities.push({ kind: "PHONE", value: phone.trim() });
    try {
      const { customer } = await crmApi.createCustomer(w, b, { ...fieldsBody(draft), identities });
      onCreated(customer);
    } catch (e) {
      const c = identityConflict(e);
      if (c) setClash(c);
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PageSection id="customer-new" title="New customer">
      <form
        className="@container flex min-w-0 flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <CustomerFieldInputs w={w} b={b} draft={draft} onEdit={(patch) => setDraft((d) => ({ ...d, ...patch }))} companies={companies} onCompany={onCompany} owners={owners} />
        <div className="grid gap-4 @lg:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Email (optional)</span>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={CRM_LIMITS.identity} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Phone (optional)</span>
            <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={CRM_LIMITS.identity} />
          </label>
        </div>
        {clash ? <ClashNotice clash={clash} onOpen={onOpen} /> : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !draft.displayName.trim()}>
            {busy ? "Adding…" : "Add customer"}
          </Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        </div>
      </form>
    </PageSection>
  );
}
