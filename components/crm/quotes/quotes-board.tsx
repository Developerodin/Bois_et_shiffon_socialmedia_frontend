"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { FileText, Plus, Printer, Search } from "lucide-react";
import type { QuoteDto, QuoteLineInput, QuoteShopifyAction, QuoteStatus } from "@/shared";
import { quotesApi, type QuoteBody } from "@/components/crm/api";
import { QuoteSheet } from "@/components/crm/quotes/quote-sheet";
import { QuoteVersions } from "@/components/crm/quotes/quote-versions";
import { QUOTE_ACTION_LABEL, QuoteShopifyDialog } from "@/components/crm/quotes/shopify-dialog";
import { productsApi, type Product } from "@/components/products/api";
import { ApiError, errorMessage } from "@/components/settings/api";
import { ListSkeleton, selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LoadFailed } from "@/components/ui/load-failed";
import { PageHeader } from "@/components/ui/page-header";
import { ListCard, ListDetail, ListRow, useListSelection } from "@/components/ui/list-detail";
import { PageSection } from "@/components/ui/page-section";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  DRAFT: "Draft",
  CREATED: "In Shopify",
  SENT: "Invoice sent",
  ACCEPTED: "Accepted",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  DECLINED: "Declined",
};

/**
 * What a person can record by hand (plan 2026-11-27-crm, Decision 16): sent and accepted only for a quote that isn't in
 * Shopify (Shopify's invoice and payment move those), declined for any quote that was made, sent or expired.
 */
export function handActions(q: Pick<QuoteDto, "status" | "shopifyName" | "lines">): ("markSent" | "markAccepted" | "decline")[] {
  const out: ("markSent" | "markAccepted" | "decline")[] = [];
  const hand = !q.shopifyName;
  if (hand && q.status === "DRAFT" && q.lines.length) out.push("markSent");
  if (hand && (q.status === "SENT" || q.status === "EXPIRED")) out.push("markAccepted");
  if (q.status === "CREATED" || q.status === "SENT" || q.status === "EXPIRED") out.push("decline");
  return out;
}
const HAND_LABEL = { markSent: "Mark as sent", markAccepted: "Mark accepted", decline: "Mark declined" } as const;

/** The Shopify step a quote is ready for, if any: create it, send its changes, or send the invoice. */
export function nextQuoteStep(q: Pick<QuoteDto, "status" | "needsShopifyUpdate" | "subtotalDiffers" | "subtotalAccepted" | "lines">): QuoteShopifyAction | null {
  if (q.status === "DRAFT") return q.lines.length ? "create" : null;
  if (q.status !== "CREATED") return null;
  if (q.needsShopifyUpdate) return "update";
  return q.subtotalDiffers && !q.subtotalAccepted ? null : "invoice";
}

/** The editor's form of a line: its text fields as typed. */
export type DraftLine = { productId: string | null; title: string; quantity: string; unitPrice: string };
const toDraft = (q: QuoteDto): DraftLine[] => q.lines.map((l) => ({ productId: l.productId, title: l.title, quantity: String(l.quantity), unitPrice: l.unitPrice }));
/** Lines as sent: a catalogue line keeps its frozen title and price unless changed here; free lines need all three. */
export const fromDraft = (lines: DraftLine[]): QuoteLineInput[] =>
  lines.map((l) => (l.productId ? { productId: l.productId, title: l.title, quantity: Number(l.quantity), unitPrice: l.unitPrice } : { title: l.title, quantity: Number(l.quantity), unitPrice: l.unitPrice }));

/**
 * The quotes tab of /crm (crm.manage): list, editor (totals always the server's answer), the Shopify steps through
 * confirm dialogs, and a print view.
 */
export function QuotesBoard({ w, b }: { w: string; b: string }) {
  const [quotes, setQuotes] = useState<QuoteDto[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // The business has no currency yet (no Shopify shop currency, no earlier quote): ask once, then create with it.
  const [askCurrency, setAskCurrency] = useState(false);
  const [currencyError, setCurrencyError] = useState<string | null>(null);
  const { selected, open, closed, ids } = useListSelection({ item: "quote", list: "quotes-list", emptyHeadingId: "quotes-empty-h" });

  const load = () => {
    setFailed(false);
    quotesApi.list(w, b).then(
      (r) => setQuotes(r.quotes),
      () => setFailed(true),
    );
  };
  // One request for every quote: fine for the tens a business keeps; past a few hundred this wants the server's paging.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once; the board remounts on a brand switch
  useEffect(load, []);
  const put = (q: QuoteDto) => setQuotes((list) => [q, ...(list ?? []).filter((x) => x.id !== q.id)]);

  /** Without `currency` the server takes the shop's or the business's earlier one; with neither it asks (quote.currency). */
  const create = async (currency?: string) => {
    // From the empty state or the currency step, the control that had focus goes away, so focus moves to the new quote.
    const moveFocus = quotes?.length === 0 || !!currency;
    setBusy(true);
    setError(null);
    setCurrencyError(null);
    try {
      const { quote } = await quotesApi.create(w, b, currency ? { lines: [], currency } : { lines: [] });
      setAskCurrency(false);
      put(quote);
      open(quote.id, moveFocus ? "always" : "if-hidden");
    } catch (e) {
      // A create without lines or a currency fails on quote.currency only when the business has no currency yet.
      if (!currency && e instanceof ApiError && e.code === "quote.currency") setAskCurrency(true);
      else if (currency) setCurrencyError(errorMessage(e));
      else setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const newQuote = (
    <Button disabled={busy || !quotes || askCurrency} aria-describedby={failed ? "quotes-load-error" : undefined} onClick={() => void create()}>
      <Plus aria-hidden="true" />
      {busy ? "Starting…" : "New quote"}
    </Button>
  );
  const current = quotes?.find((q) => q.id === selected) ?? null;
  let body: React.ReactNode;
  if (failed)
    body = (
      <div id="quotes-load-error">
        <LoadFailed what="the quotes" onRetry={load} />
      </div>
    );
  else if (!quotes) body = <ListSkeleton label="Loading quotes" rows={3} />;
  else if (!quotes.length)
    body = (
      <EmptyState
        icon={FileText}
        title="No quotes yet"
        headingId={ids.emptyHeading}
        description="A quote lists products and prices for one customer. When it's ready it becomes a Shopify draft order, and the customer gets Shopify's invoice only when you send it. Start one with New quote above."
      />
    );
  else
    body = (
      <ListDetail
        list={
          <ListCard id={ids.list} title="All quotes" description={`${quotes.length} ${quotes.length === 1 ? "quote" : "quotes"}, newest change first`}>
            {quotes.map((q) => (
              <ListRow key={q.id} selected={q.id === selected} onSelect={() => open(q.id)} className="flex-col gap-1">
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{q.number}</span>
                    <span className="text-muted-foreground"> · {q.contactName ?? "No contact yet"}</span>
                  </span>
                  <StatusBadge status={q.status}>{QUOTE_STATUS_LABEL[q.status]}</StatusBadge>
                </span>
                <span className="flex w-full items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="font-medium tabular-nums text-foreground">
                    {q.totals.total} {q.currency}
                  </span>
                  <time dateTime={q.updatedAt}>{SHORT_DATE.format(new Date(q.updatedAt))}</time>
                </span>
              </ListRow>
            ))}
          </ListCard>
        }
        detail={current ? <QuoteEditor key={current.id} sectionId={ids.item} w={w} b={b} quote={current} onChange={put} onCancelled={(q) => (put(q), open(q.id, "always"))} onRemoved={() => (setQuotes((l) => (l ?? []).filter((x) => x.id !== current.id)), closed())} /> : null}
        placeholder={<EmptyState variant="card" icon={FileText} title="No quote open" description="Pick a quote to see and edit it, or start a new one." />}
      />
    );

  // The board owns the page header (Blog's page keeps its own): New quote needs the board's state. It is always there,
  // disabled until the list has loaded, so the header doesn't shift and the button stays after a failed load.
  return (
    <>
      <PageHeader title="Quotes" actions={newQuote}>
        Quotes become Shopify draft orders when you say so. The customer gets Shopify&rsquo;s invoice email only when you send it.
      </PageHeader>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {askCurrency ? <CurrencyStep busy={busy} error={currencyError} onCreate={(c) => void create(c)} onCancel={() => (setAskCurrency(false), setCurrencyError(null))} /> : null}
      {body}
    </>
  );
}

/** Currencies offered first when a business has none yet; any other ISO 4217 code can be typed under Other. */
const QUOTE_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "CAD", "AUD", "SEK", "DKK", "NOK", "PLN", "CZK", "INR", "JPY"];

/**
 * Asked once per business, when the first quote can't take a currency from a Shopify shop: every later quote keeps it
 * (the server stores it on the business). Takes focus when it appears; only a failed create is announced as an alert.
 */
function CurrencyStep({ busy, error, onCreate, onCancel }: { busy: boolean; error: string | null; onCreate(currency: string): void; onCancel(): void }) {
  const [pick, setPick] = useState("EUR");
  const [other, setOther] = useState("");
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => first.current?.focus(), []);
  const code = pick === "other" ? other.trim().toUpperCase() : pick;
  const valid = /^[A-Z]{3}$/.test(code);
  return (
    <PageSection
      id="quote-currency"
      title="Which currency are this business's quotes in?"
      description="It has no Shopify store to take the currency from. Its first quote sets it, and every quote after uses the same one."
    >
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) onCreate(code);
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted-foreground">Currency</span>
          <select ref={first} className={cn(selectClass, "w-auto pointer-coarse:h-11")} value={pick} onChange={(e) => setPick(e.target.value)}>
            {QUOTE_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value="other">Other…</option>
          </select>
        </label>
        {pick === "other" ? (
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-muted-foreground">Code (3 letters)</span>
            <Input value={other} onChange={(e) => setOther(e.target.value)} maxLength={3} className="w-24 uppercase" aria-describedby="quote-currency-hint" autoFocus />
          </label>
        ) : null}
        <Button type="submit" disabled={busy || !valid}>
          {busy ? "Creating…" : "Create quote"}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        {pick === "other" ? (
          <p id="quote-currency-hint" className="basis-full text-xs text-muted-foreground">
            The ISO code, like SGD or MXN.
          </p>
        ) : null}
        {error ? (
          <p className="basis-full text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </form>
    </PageSection>
  );
}

const SHORT_DATE = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" });
/**
 * The quote lines' columns once the editor's own column is wide (`@lg`): item, quantity, unit price, Remove. Shared by
 * the column heads and every row so they line up. 5.5rem is the width of the ghost "Remove" button at size sm: change
 * one with the other. Narrower, rows stack (the item on its own row) and there are no heads.
 */
const LINE_COLS_WIDE = "@lg:grid-cols-[minmax(0,1fr)_5rem_7rem_5.5rem]";

/** What a person is asked before deleting or cancelling: a sent quote's invoice stays payable in Shopify. */
export function cancelQuestion(q: Pick<QuoteDto, "status" | "shopifyName" | "sentAt">) {
  if (q.status === "DRAFT" && !q.shopifyName && !q.sentAt) return "Delete this quote?";
  if (q.status === "SENT" && q.shopifyName) return "Cancel this quote? Shopify's invoice stays payable until you delete the draft order in Shopify.";
  if (!q.shopifyName) return "Cancel this quote?";
  return "Cancel this quote? Shopify's draft order stays as it is.";
}

/** "Shopify's subtotal is 1872.01 EUR; ours is 1872.00 EUR." when the two differ, else null. */
export function subtotalNotice(q: Pick<QuoteDto, "subtotalDiffers" | "shopifySubtotal" | "totals" | "currency">) {
  return q.subtotalDiffers ? `Shopify's subtotal is ${q.shopifySubtotal} ${q.currency}; ours is ${q.totals.total} ${q.currency}.` : null;
}

function QuoteEditor({ sectionId, w, b, quote, onChange, onCancelled, onRemoved }: { sectionId: string; w: string; b: string; quote: QuoteDto; onChange(q: QuoteDto): void; onCancelled(q: QuoteDto): void; onRemoved(): void }) {
  const editable = quote.status === "DRAFT" || quote.status === "CREATED";
  const reset = (q: QuoteDto) => ({
    contactName: q.contactName ?? "",
    contactEmail: q.contactEmail ?? "",
    note: q.note ?? "",
    internalNote: q.internalNote ?? "",
    discountKind: q.discount?.kind ?? "",
    discountValue: q.discount?.value ?? "",
    lines: toDraft(q),
  });
  const [form, setForm] = useState(() => reset(quote));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ action: QuoteShopifyAction; again?: boolean } | null>(null);
  const [declining, setDeclining] = useState(false);
  const [reason, setReason] = useState("");
  const hand = handActions(quote);
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<Product[]>([]);
  const step = nextQuoteStep(quote);
  const notice = subtotalNotice(quote);

  const edit = (patch: Partial<ReturnType<typeof reset>>) => {
    setForm((f) => ({ ...f, ...patch }));
    setDirty(true);
  };
  const setLine = (i: number, patch: Partial<DraftLine>) => edit({ lines: form.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const run = async (what: string, call: () => Promise<{ quote: QuoteDto }>) => {
    setBusy(what);
    setError(null);
    try {
      // The server's answer is the quote from here on: its lines, prices and totals replace the form's.
      const { quote: q } = await call();
      onChange(q);
      setForm(reset(q));
      setDirty(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const save = () => {
    const body: QuoteBody & { version: number } = {
      version: quote.version,
      contactName: form.contactName.trim() || null,
      contactEmail: form.contactEmail.trim() || null,
      note: form.note.trim() || null,
      internalNote: form.internalNote.trim() || null,
      discount: form.discountKind && form.discountValue ? { kind: form.discountKind as "PERCENT" | "AMOUNT", value: form.discountValue } : null,
      lines: fromDraft(form.lines),
    };
    return run("save", () => quotesApi.update(w, b, quote.id, body));
  };
  const find = async () => {
    try {
      setFound((await productsApi.page(w, b, { page: 1, limit: 20, q: search.trim(), stock: "" })).products);
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  const meta = [quote.contactName ?? "No contact yet", quote.shopifyName ? `Shopify draft ${quote.shopifyName}` : null, quote.validUntil ? `Valid until ${quote.validUntil}` : null].filter(Boolean).join(" · ");
  return (
    <PageSection
      id={sectionId}
      title={`Quote ${quote.number}`}
      description={
        <span className="flex flex-wrap items-center gap-2">
          <StatusBadge status={quote.status}>{QUOTE_STATUS_LABEL[quote.status]}</StatusBadge>
          <span className="min-w-0 break-words">{meta}</span>
        </span>
      }
      actions={
        <>
          {step ? (
            <Button size="sm" disabled={!!busy || dirty} aria-describedby={dirty ? "quote-unsaved" : undefined} onClick={() => setDialog({ action: step })}>
              {QUOTE_ACTION_LABEL[step]}
            </Button>
          ) : null}
          {hand.map((a) =>
            a === "decline" ? (
              <Button key={a} size="sm" variant="outline" disabled={!!busy || declining} onClick={() => setDeclining(true)}>
                {HAND_LABEL[a]}
              </Button>
            ) : (
              <Button key={a} size="sm" variant={a === "markSent" && !step ? "default" : "outline"} disabled={!!busy || dirty} onClick={() => run(a, () => quotesApi.act(w, b, quote.id, { action: a, version: quote.version }))}>
                {busy === a ? "Saving…" : HAND_LABEL[a]}
              </Button>
            ),
          )}
          {quote.status === "SENT" ? (
            <>
              {quote.shopifyName ? (
                <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setDialog({ action: "invoice", again: true })}>
                  Send the invoice again
                </Button>
              ) : null}
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("revise", () => quotesApi.act(w, b, quote.id, { action: "revise", version: quote.version }))}>
                Revise
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="outline" asChild>
            <Link href={`/crm/quotes/${encodeURIComponent(quote.id)}/print`} target="_blank" rel="noopener noreferrer">
              <Printer aria-hidden="true" />
              Print view
            </Link>
          </Button>
          {quote.status !== "ACCEPTED" && quote.status !== "CANCELLED" && quote.status !== "DECLINED" ? (
            <Button
              size="sm"
              variant="ghost"
              disabled={!!busy}
              onClick={async () => {
                const draft = quote.status === "DRAFT" && !quote.shopifyName && !quote.sentAt;
                if (!window.confirm(cancelQuestion(quote))) return;
                try {
                  const out = await quotesApi.remove(w, b, quote.id);
                  if (draft || !out) onRemoved();
                  else {
                    // Its Cancel button is gone now (a cancelled quote has none): focus goes to the quote's heading.
                    onCancelled(out.quote);
                    setInfo(out.notice);
                  }
                } catch (e) {
                  setError(errorMessage(e));
                }
              }}
            >
              {quote.status === "DRAFT" && !quote.shopifyName && !quote.sentAt ? "Delete" : "Cancel quote"}
            </Button>
          ) : null}
        </>
      }
    >
      {/* The editor's own column width decides its layout (the page may be split in two). */}
      <div className="@container flex min-w-0 flex-col gap-5">
        {notice ? (
          <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm" role="status">
            <p>{notice} {quote.subtotalAccepted ? "You accepted Shopify's." : "The invoice waits until you accept Shopify's, or change the quote."}</p>
            {!quote.subtotalAccepted && quote.status === "CREATED" ? (
              <Button size="sm" variant="outline" className="self-start" disabled={!!busy} onClick={() => run("accept", () => quotesApi.act(w, b, quote.id, { action: "acceptSubtotal", version: quote.version }))}>
                Accept Shopify&rsquo;s subtotal
              </Button>
            ) : null}
          </div>
        ) : null}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {declining ? (
          <form
            className="flex flex-col gap-2 rounded-xl border border-border p-3 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void run("decline", () => quotesApi.act(w, b, quote.id, { action: "decline", version: quote.version, reason: reason.trim() || null })).then(() => setDeclining(false));
            }}
          >
            <label className="flex flex-col gap-1.5">
              <span className="text-muted-foreground">Why did the customer say no? (optional, for the team)</span>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} autoFocus />
            </label>
            {quote.shopifyName ? <p className="text-xs text-muted-foreground">Shopify&rsquo;s draft order stays as it is. If the customer pays it anyway, the quote shows as accepted.</p> : null}
            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={!!busy}>{busy === "decline" ? "Saving…" : "Mark declined"}</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setDeclining(false)}>Cancel</Button>
            </div>
          </form>
        ) : null}
        {quote.status === "DECLINED" && quote.declinedReason ? <p className="text-sm"><span className="text-muted-foreground">Declined: </span><span className="whitespace-pre-wrap">{quote.declinedReason}</span></p> : null}
        {info ? <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm" role="status">{info}</p> : null}
        {editable ? (
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid gap-4 @lg:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Contact name</span>
                <Input value={form.contactName} onChange={(e) => edit({ contactName: e.target.value })} maxLength={200} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Contact email (gets Shopify&rsquo;s invoice)</span>
                <Input type="email" value={form.contactEmail} onChange={(e) => edit({ contactEmail: e.target.value })} maxLength={254} />
              </label>
            </div>
            <fieldset className="flex min-w-0 flex-col gap-3">
              <legend className="mb-1.5 text-sm text-muted-foreground">Lines ({form.lines.length} of 100)</legend>
              {form.lines.length ? (
                <div className={cn("hidden gap-2 text-xs text-muted-foreground @lg:grid", LINE_COLS_WIDE)} aria-hidden="true">
                  <span>Item</span>
                  <span>Qty</span>
                  <span>Unit price ({quote.currency})</span>
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted-foreground">No lines yet. Find a product from the catalogue, or add a free line.</p>
              )}
              {form.lines.length ? (
                <div className="flex flex-col gap-3">
                  {form.lines.map((l, i) => (
                    // Narrow: the title on its own row, then quantity, price and Remove; wide: one row under the column heads.
                    <div key={i} className={cn("grid grid-cols-[5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border pb-3 last:border-b-0 last:pb-0 @lg:border-b-0 @lg:pb-0", LINE_COLS_WIDE)}>
                      <Input className="col-span-3 @lg:col-span-1" value={l.title} onChange={(e) => setLine(i, { title: e.target.value })} maxLength={255} aria-label="Line title" placeholder="Item" required />
                      <Input value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} inputMode="numeric" aria-label="Quantity" required />
                      <Input value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} inputMode="decimal" aria-label={`Unit price (${quote.currency})`} placeholder={quote.currency} required />
                      <Button type="button" size="sm" variant="ghost" onClick={() => edit({ lines: form.lines.filter((_, j) => j !== i) })}>
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              ) : null}
              <div className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3 @lg:flex-row @lg:items-center">
                <div className="flex min-w-0 flex-1 gap-2">
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a product" className="min-w-0 flex-1 bg-card" aria-label="Find a product" />
                  <Button type="button" size="sm" variant="outline" onClick={find}>
                    <Search aria-hidden="true" />
                    Find
                  </Button>
                </div>
                <Button type="button" size="sm" variant="outline" className="self-start @lg:self-auto" disabled={form.lines.length >= 100} onClick={() => edit({ lines: [...form.lines, { productId: null, title: "", quantity: "1", unitPrice: "" }] })}>
                  <Plus aria-hidden="true" />
                  Add a free line
                </Button>
              </div>
              {found.length ? (
                <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm">
                  {found.map((p) => (
                    <li key={p.id}>
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left hover:bg-muted disabled:opacity-50 pointer-coarse:py-3"
                        disabled={form.lines.length >= 100}
                        onClick={() => {
                          edit({ lines: [...form.lines, { productId: p.id, title: p.title, quantity: "1", unitPrice: p.price ?? "" }] });
                          setFound([]);
                        }}
                      >
                        <span className="min-w-0 truncate">{p.title}</span>
                        <span className="shrink-0 tabular-nums text-muted-foreground">{p.price ? `${p.price} ${p.currency ?? ""}` : "no price"}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </fieldset>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Discount</span>
                <select className={cn(selectClass, "w-auto pointer-coarse:h-11")} value={form.discountKind} onChange={(e) => edit({ discountKind: e.target.value })}>
                  <option value="">None</option>
                  <option value="PERCENT">Percent</option>
                  <option value="AMOUNT">Amount ({quote.currency})</option>
                </select>
              </label>
              {form.discountKind ? <Input className="max-w-[8rem]" value={form.discountValue} onChange={(e) => edit({ discountValue: e.target.value })} inputMode="decimal" aria-label="Discount value" /> : null}
            </div>
            <div className="grid gap-4 @lg:grid-cols-2">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Note for the customer</span>
                <Textarea value={form.note} onChange={(e) => edit({ note: e.target.value })} maxLength={2000} rows={3} />
              </label>
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="text-muted-foreground">Internal note (never sent)</span>
                <Textarea value={form.internalNote} onChange={(e) => edit({ internalNote: e.target.value })} maxLength={2000} rows={3} />
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={!!busy || !dirty}>
                {busy === "save" ? "Saving…" : "Save"}
              </Button>
              {dirty ? <span id="quote-unsaved" className="text-xs text-muted-foreground">The totals below update when you save.</span> : null}
            </div>
          </form>
        ) : null}
        <QuoteVersions key={quote.version} w={w} b={b} quote={quote} />
        <section aria-labelledby="quote-preview-h" className="flex flex-col gap-2">
          <h3 id="quote-preview-h" className="text-xs font-medium text-muted-foreground">What the customer sees</h3>
          <div className="overflow-x-auto rounded-xl border border-border p-4">
            <QuoteSheet quote={quote} headingLevel="h4" />
          </div>
        </section>
      </div>
      {dialog ? (
        <QuoteShopifyDialog
          w={w}
          b={b}
          quote={quote}
          action={dialog.action}
          again={dialog.again}
          onClose={() => setDialog(null)}
          onDone={(q) => {
            setDialog(null);
            onChange(q);
            setForm(reset(q));
          }}
        />
      ) : null}
    </PageSection>
  );
}
