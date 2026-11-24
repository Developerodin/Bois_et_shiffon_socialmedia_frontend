"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { QuoteDto, QuoteLineInput, QuoteShopifyAction, QuoteStatus } from "@/shared";
import { quotesApi, type QuoteBody } from "@/components/crm/api";
import { QuoteSheet } from "@/components/crm/quotes/quote-sheet";
import { QUOTE_ACTION_LABEL, QuoteShopifyDialog } from "@/components/crm/quotes/shopify-dialog";
import { productsApi, type Product } from "@/components/products/api";
import { errorMessage } from "@/components/settings/api";
import { ListSkeleton, selectClass } from "@/components/settings/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadFailed } from "@/components/ui/load-failed";
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
};

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
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setFailed(false);
    quotesApi.list(w, b).then(
      (r) => setQuotes(r.quotes),
      () => setFailed(true),
    );
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once; the board remounts on a brand switch
  useEffect(load, []);
  const put = (q: QuoteDto) => setQuotes((list) => [q, ...(list ?? []).filter((x) => x.id !== q.id)]);

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      const { quote } = await quotesApi.create(w, b, { lines: [] });
      put(quote);
      setSelected(quote.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (failed) return <LoadFailed what="the quotes" onRetry={load} className="px-5 py-6" />;
  if (!quotes) return <ListSkeleton label="Loading quotes" rows={3} />;
  const current = quotes.find((q) => q.id === selected) ?? null;
  return (
    <div className="grid gap-6 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <div className="flex flex-col gap-3">
        <Button size="sm" className="self-start" disabled={busy} onClick={create}>
          New quote
        </Button>
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        {quotes.length ? (
          <ul className="flex flex-col gap-1">
            {quotes.map((q) => (
              <li key={q.id}>
                <button type="button" onClick={() => setSelected(q.id)} className={cn("flex w-full flex-col items-start gap-1 rounded-xl px-3 py-2 text-left text-sm hover:bg-muted", q.id === selected && "bg-muted")}>
                  <span className="font-medium">
                    {q.number} · {q.totals.total} {q.currency}
                  </span>
                  <span className="text-muted-foreground">{q.contactName ?? "No contact yet"}</span>
                  <StatusBadge status={q.status}>{QUOTE_STATUS_LABEL[q.status]}</StatusBadge>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No quotes yet.</p>
        )}
      </div>
      {current ? (
        <QuoteEditor key={current.id} w={w} b={b} quote={current} onChange={put} onRemoved={() => setQuotes((l) => (l ?? []).filter((x) => x.id !== current.id))} />
      ) : (
        <p className="text-sm text-muted-foreground">Pick a quote, or start a new one.</p>
      )}
    </div>
  );
}

/** "Shopify's subtotal is 1872.01 EUR; ours is 1872.00 EUR." when the two differ, else null. */
export function subtotalNotice(q: Pick<QuoteDto, "subtotalDiffers" | "shopifySubtotal" | "totals" | "currency">) {
  return q.subtotalDiffers ? `Shopify's subtotal is ${q.shopifySubtotal} ${q.currency}; ours is ${q.totals.total} ${q.currency}.` : null;
}

function QuoteEditor({ w, b, quote, onChange, onRemoved }: { w: string; b: string; quote: QuoteDto; onChange(q: QuoteDto): void; onRemoved(): void }) {
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
  const [dialog, setDialog] = useState<{ action: QuoteShopifyAction; again?: boolean } | null>(null);
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

  return (
    <div className="flex min-w-0 flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={quote.status}>{QUOTE_STATUS_LABEL[quote.status]}</StatusBadge>
        {quote.shopifyName ? <span className="text-xs text-muted-foreground">Shopify draft {quote.shopifyName}</span> : null}
        <span className="text-xs text-muted-foreground">Valid until {quote.validUntil}</span>
      </div>
      {notice ? (
        <div className="flex flex-col gap-2 rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 text-sm" role="status">
          <p>{notice} {quote.subtotalAccepted ? "You accepted Shopify's." : "The invoice waits until you accept Shopify's, or change the quote."}</p>
          {!quote.subtotalAccepted && quote.status === "CREATED" ? (
            <Button size="sm" variant="outline" className="self-start" disabled={!!busy} onClick={() => run("accept", () => quotesApi.act(w, b, quote.id, { action: "acceptSubtotal", version: quote.version }))}>
              Accept Shopify&rsquo;s subtotal
            </Button>
          ) : null}
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {step ? (
          <Button size="sm" disabled={!!busy || dirty} onClick={() => setDialog({ action: step })}>
            {QUOTE_ACTION_LABEL[step]}
          </Button>
        ) : null}
        {quote.status === "SENT" ? (
          <>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => setDialog({ action: "invoice", again: true })}>
              Send the invoice again
            </Button>
            <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("revise", () => quotesApi.act(w, b, quote.id, { action: "revise", version: quote.version }))}>
              Revise
            </Button>
          </>
        ) : null}
        <Button size="sm" variant="outline" asChild>
          <Link href={`/crm/quotes/${encodeURIComponent(quote.id)}/print`} target="_blank" rel="noopener noreferrer">
            Print view
          </Link>
        </Button>
        {quote.status !== "ACCEPTED" && quote.status !== "CANCELLED" ? (
          <Button
            size="sm"
            variant="ghost"
            disabled={!!busy}
            onClick={async () => {
              const draft = quote.status === "DRAFT" && !quote.shopifyName;
              if (!window.confirm(draft ? "Delete this quote?" : "Cancel this quote? Shopify's draft order stays as it is.")) return;
              try {
                await quotesApi.remove(w, b, quote.id);
                if (draft) onRemoved();
                else onChange({ ...quote, status: "CANCELLED" });
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            {quote.status === "DRAFT" && !quote.shopifyName ? "Delete" : "Cancel quote"}
          </Button>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
      {editable ? (
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Contact name
              <Input value={form.contactName} onChange={(e) => edit({ contactName: e.target.value })} maxLength={200} />
            </label>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Contact email (gets Shopify&rsquo;s invoice)
              <Input type="email" value={form.contactEmail} onChange={(e) => edit({ contactEmail: e.target.value })} maxLength={254} />
            </label>
          </div>
          <fieldset className="flex flex-col gap-2">
            <legend className="text-sm font-medium">Lines ({form.lines.length} of 100)</legend>
            {form.lines.map((l, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_7rem_auto] items-center gap-2">
                <Input value={l.title} onChange={(e) => setLine(i, { title: e.target.value })} maxLength={255} aria-label="Line title" required />
                <Input value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} inputMode="numeric" aria-label="Quantity" required />
                <Input value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: e.target.value })} inputMode="decimal" aria-label={`Unit price (${quote.currency})`} required />
                <Button type="button" size="sm" variant="ghost" onClick={() => edit({ lines: form.lines.filter((_, j) => j !== i) })}>
                  Remove
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" disabled={form.lines.length >= 100} onClick={() => edit({ lines: [...form.lines, { productId: null, title: "", quantity: "1", unitPrice: "" }] })}>
                Add a free line
              </Button>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a product" className="max-w-xs" aria-label="Find a product" />
              <Button type="button" size="sm" variant="outline" onClick={find}>
                Find
              </Button>
            </div>
            {found.length ? (
              <ul className="flex flex-col gap-1 text-sm">
                {found.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="rounded-lg px-2 py-1 text-left hover:bg-muted disabled:opacity-50"
                      disabled={form.lines.length >= 100}
                      onClick={() => {
                        edit({ lines: [...form.lines, { productId: p.id, title: p.title, quantity: "1", unitPrice: p.price ?? "" }] });
                        setFound([]);
                      }}
                    >
                      {p.title} {p.price ? `· ${p.price} ${p.currency ?? ""}` : "· no price"}
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </fieldset>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-sm font-medium">
              Discount
              <select className={selectClass} value={form.discountKind} onChange={(e) => edit({ discountKind: e.target.value })}>
                <option value="">None</option>
                <option value="PERCENT">Percent</option>
                <option value="AMOUNT">Amount ({quote.currency})</option>
              </select>
            </label>
            {form.discountKind ? <Input className="max-w-[8rem]" value={form.discountValue} onChange={(e) => edit({ discountValue: e.target.value })} inputMode="decimal" aria-label="Discount value" /> : null}
          </div>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Note for the customer
            <Textarea value={form.note} onChange={(e) => edit({ note: e.target.value })} maxLength={2000} rows={2} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">
            Internal note (never sent)
            <Textarea value={form.internalNote} onChange={(e) => edit({ internalNote: e.target.value })} maxLength={2000} rows={2} />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="submit" size="sm" disabled={!!busy || !dirty}>
              {busy === "save" ? "Saving…" : "Save"}
            </Button>
            {dirty ? <span className="text-xs text-muted-foreground">The totals below update when you save.</span> : null}
          </div>
        </form>
      ) : null}
      <div className="rounded-xl border border-border p-4">
        <QuoteSheet quote={quote} />
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
    </div>
  );
}
