"use client";

import { useEffect, useState } from "react";
import type { DraftOrderWritePreview, InvoiceEmailInput, InvoiceWritePreview, QuoteDto, QuoteShopifyAction } from "@/shared";
import { quotesApi, type QuotePreview } from "@/components/crm/api";
import { writesNotice } from "@/components/blog/shopify-dialog";
import { ApiError, errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export const QUOTE_ACTION_LABEL: Record<QuoteShopifyAction, string> = { create: "Create in Shopify", update: "Send changes to Shopify", invoice: "Send the invoice" };

const money = (amount: string, currency: string) => `${amount} ${currency}`;

/** Exactly what the confirm writes, from the server's preview (what its token covers). */
export function QuotePreviewBody({ action, preview }: { action: QuoteShopifyAction; preview: QuotePreview }) {
  const notice = writesNotice(preview.writes);
  const row = (term: string, value: string) => (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-muted-foreground">{term}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words">{value || "None"}</dd>
    </div>
  );
  if (action === "invoice") {
    const p = preview.preview as InvoiceWritePreview;
    return (
      <div className="flex flex-col gap-4 text-sm">
        {notice ? <p className="rounded-xl border border-border bg-muted/50 px-3 py-2">{notice}</p> : null}
        <p>Shopify emails its invoice for draft order {p.draftOrder}, with a link to pay.</p>
        <dl className="flex flex-col gap-1">
          {row("To", p.to)}
          {row("Subject", p.subject)}
          {row("Message", p.message)}
        </dl>
      </div>
    );
  }
  const p = preview.preview as DraftOrderWritePreview;
  return (
    <div className="flex flex-col gap-4 text-sm">
      {notice ? <p className="rounded-xl border border-border bg-muted/50 px-3 py-2">{notice}</p> : null}
      <p>{action === "create" ? "Creates a draft order. The customer gets no email until you send the invoice." : `Replaces draft order ${p.draftOrder ?? ""} in Shopify. No email is sent.`}</p>
      <table className="w-full text-left">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 font-normal">Line</th>
            <th className="py-1 text-right font-normal">Qty</th>
            <th className="py-1 text-right font-normal">Unit price</th>
          </tr>
        </thead>
        <tbody>
          {p.lines.map((l, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1">{l.title}{l.variantId ? null : <span className="ml-2 text-xs text-muted-foreground">free line</span>}</td>
              <td className="py-1 text-right">{l.quantity}</td>
              <td className="py-1 text-right">{money(l.unitPrice, p.currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="flex flex-col gap-1">
        {row("Discount", p.discount ? (p.discount.kind === "PERCENT" ? `${p.discount.value}%` : money(p.discount.value, p.currency)) : "")}
        {row("Note", p.note ?? "")}
        {row("Total", `${money(p.total, p.currency)} before shipping and tax (Shopify adds those)`)}
      </dl>
    </div>
  );
}

/**
 * Preview → the person confirms → written at most once. A change since the preview shows the new one to check again.
 * An invoice's to, subject and message can be changed here; "Check" previews them again (the token covers them).
 */
export function QuoteShopifyDialog({ w, b, quote, action, again, onClose, onDone }: { w: string; b: string; quote: QuoteDto; action: QuoteShopifyAction; again?: boolean; onClose(): void; onDone(q: QuoteDto): void }) {
  const [state, setState] = useState<QuotePreview | null>(null);
  const [email, setEmail] = useState<InvoiceEmailInput>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async (e: InvoiceEmailInput = email) => {
    setState(null);
    setError(null);
    try {
      const p = await quotesApi.preview(w, b, quote.id, action, { again, ...(action === "invoice" ? { email: e } : {}) });
      setState(p);
      if (action === "invoice") {
        const { to, subject, message } = p.preview as InvoiceWritePreview;
        setEmail({ to, subject, message });
      }
    } catch (x) {
      setError(errorMessage(x, "Couldn't prepare the change. Try again."));
    }
  };
  useEffect(() => {
    void load({});
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening
  }, []);

  const confirm = async () => {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      const sent = action === "invoice" ? (({ to, subject, message }) => ({ to, subject, message }))(state.preview as InvoiceWritePreview) : undefined;
      onDone((await quotesApi.confirm(w, b, quote.id, action, state.confirmToken, sent)).quote);
    } catch (x) {
      setError(errorMessage(x, "Couldn't send it. Try again."));
      if (x instanceof ApiError && x.code === "CHANGED") await load();
    } finally {
      setBusy(false);
    }
  };
  const p = state?.preview as InvoiceWritePreview | undefined;
  const edited = action === "invoice" && !!p && (email.to !== p.to || email.subject !== p.subject || email.message !== p.message);

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{again ? "Send the invoice again" : QUOTE_ACTION_LABEL[action]}</DialogTitle>
          <DialogDescription>This is exactly what will be written to Shopify.</DialogDescription>
        </DialogHeader>
        {action === "invoice" && state ? (
          <form
            className="flex flex-col gap-2 text-sm"
            onSubmit={(e) => {
              e.preventDefault();
              void load(email);
            }}
          >
            <label className="flex flex-col gap-1 font-medium">
              To
              <Input type="email" value={email.to ?? ""} onChange={(e) => setEmail({ ...email, to: e.target.value })} maxLength={254} />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              Subject
              <Input value={email.subject ?? ""} onChange={(e) => setEmail({ ...email, subject: e.target.value })} maxLength={200} />
            </label>
            <label className="flex flex-col gap-1 font-medium">
              Message
              <Textarea value={email.message ?? ""} onChange={(e) => setEmail({ ...email, message: e.target.value })} maxLength={2000} rows={3} />
            </label>
            {edited ? (
              <Button type="submit" size="sm" variant="outline" className="self-start">
                Check the changes
              </Button>
            ) : null}
          </form>
        ) : null}
        {state ? <QuotePreviewBody action={action} preview={state} /> : !error ? <p className="text-sm text-muted-foreground">Preparing…</p> : null}
        {error ? <p className="text-sm text-destructive" role="alert">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={confirm} disabled={busy || !state || !state.writes.ready || edited}>
            {busy ? "Sending…" : again ? "Send again" : QUOTE_ACTION_LABEL[action]}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
