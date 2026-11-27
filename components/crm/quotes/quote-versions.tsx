"use client";

import { useState } from "react";
import type { QuoteDto, QuoteLine, QuoteVersionDto } from "@/shared";
import { quotesApi } from "@/components/crm/api";
import { QuoteSheet } from "@/components/crm/quotes/quote-sheet";
import { errorMessage } from "@/components/settings/api";
import { Button } from "@/components/ui/button";

/** One line's key across versions: its catalogue product, else its title (free lines). */
const keyOf = (l: QuoteLine) => l.productId ?? `free:${l.title}`;

/** What changed from an earlier version's lines to the current ones, in plain words (one entry per line touched). */
export function versionChanges(before: QuoteLine[], now: QuoteLine[]): string[] {
  const out: string[] = [];
  const was = new Map(before.map((l) => [keyOf(l), l]));
  const is = new Map(now.map((l) => [keyOf(l), l]));
  for (const [k, l] of was) {
    const n = is.get(k);
    if (!n) {
      out.push(`Removed: ${l.title}`);
      continue;
    }
    const parts = [
      l.title !== n.title ? `title "${l.title}" → "${n.title}"` : null,
      l.quantity !== n.quantity ? `quantity ${l.quantity} → ${n.quantity}` : null,
      l.unitPrice !== n.unitPrice ? `price ${l.unitPrice} → ${n.unitPrice}` : null,
    ].filter(Boolean);
    if (parts.length) out.push(`${n.title}: ${parts.join(", ")}`);
  }
  for (const [k, l] of is) if (!was.has(k)) out.push(`Added: ${l.title}`);
  return out;
}

const WHEN = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** The quote editor's "Earlier versions": listed on demand, one opened read-only with what changed since. */
export function QuoteVersions({ w, b, quote }: { w: string; b: string; quote: QuoteDto }) {
  const [list, setList] = useState<QuoteVersionDto[] | null>(null);
  const [open, setOpen] = useState<QuoteVersionDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = async () => {
    setError(null);
    try {
      setList((await quotesApi.versions(w, b, quote.id)).versions);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const show = async (v: number) => {
    setError(null);
    try {
      setOpen((await quotesApi.versions(w, b, quote.id, v)).versions[0] ?? null);
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  const changes = open?.lines ? [...versionChanges(open.lines, quote.lines), ...(open.note !== quote.note ? ["The note for the customer changed"] : [])] : [];
  return (
    <section aria-labelledby="quote-versions-h" className="flex flex-col gap-2 text-sm">
      <h3 id="quote-versions-h" className="text-xs font-medium text-muted-foreground">
        Earlier versions
      </h3>
      {error ? (
        <p className="text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {!list ? (
        <Button size="sm" variant="outline" className="self-start" onClick={() => void load()}>
          Show earlier versions
        </Button>
      ) : !list.length ? (
        <p className="text-muted-foreground">No earlier versions: this quote hasn&rsquo;t been changed since it was started.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {list.map((v) => (
            <li key={v.version}>
              <Button size="sm" variant={open?.version === v.version ? "default" : "outline"} aria-pressed={open?.version === v.version} onClick={() => void show(v.version)}>
                Version {v.version}
                {v.sent ? " (sent)" : ""} · {WHEN.format(new Date(v.createdAt))}
              </Button>
            </li>
          ))}
        </ul>
      )}
      {open?.lines && open.totals ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
          <div>
            <p className="font-medium">Changed since version {open.version}</p>
            {changes.length ? (
              <ul className="list-disc pl-5">
                {changes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">The lines and note are the same; the discount or contact may differ.</p>
            )}
          </div>
          <QuoteSheet quote={{ ...quote, lines: open.lines, discount: open.discount ?? null, note: open.note ?? null, totals: open.totals, subtotalAccepted: false }} headingLevel="h4" />
        </div>
      ) : null}
    </section>
  );
}
