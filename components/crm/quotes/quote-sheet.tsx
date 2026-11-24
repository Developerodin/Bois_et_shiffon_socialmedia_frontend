import type { QuoteDto } from "@/shared";

/** The quote as the customer would read it: lines, discount and totals as the server worked them out. Also the print view. */
export function QuoteSheet({ quote, brand }: { quote: QuoteDto; brand?: string }) {
  const m = (amount: string) => `${amount} ${quote.currency}`;
  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">
          {brand ? `${brand}: quote ${quote.number}` : `Quote ${quote.number}`}
        </h2>
        <span className="text-muted-foreground">Valid until {quote.validUntil}</span>
      </div>
      {quote.contactName || quote.contactEmail ? <p>For {[quote.contactName, quote.contactEmail].filter(Boolean).join(", ")}</p> : null}
      <table className="w-full text-left">
        <thead className="text-muted-foreground">
          <tr>
            <th className="py-1 font-normal">Item</th>
            <th className="py-1 text-right font-normal">Qty</th>
            <th className="py-1 text-right font-normal">Unit price</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((l, i) => (
            <tr key={i} className="border-t border-border">
              <td className="py-1">{l.title}</td>
              <td className="py-1 text-right">{l.quantity}</td>
              <td className="py-1 text-right">{m(l.unitPrice)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ml-auto flex w-full max-w-xs flex-col gap-1">
        <div className="flex justify-between"><dt>Subtotal</dt><dd>{m(quote.totals.subtotal)}</dd></div>
        {quote.discount ? (
          <div className="flex justify-between">
            <dt>Discount{quote.discount.kind === "PERCENT" ? ` (${quote.discount.value}%)` : ""}</dt>
            <dd>−{m(quote.totals.discount)}</dd>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-border pt-1 font-semibold"><dt>Total</dt><dd>{m(quote.totals.total)}</dd></div>
        <p className="text-xs text-muted-foreground">Shipping and tax are added by Shopify.</p>
      </dl>
      {quote.note ? <p className="whitespace-pre-wrap">{quote.note}</p> : null}
    </div>
  );
}
