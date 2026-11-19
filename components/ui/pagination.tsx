"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { selectClass } from "@/components/settings/shared";
import { pageItems } from "@/lib/page-items";
import { cn } from "@/lib/utils";

const count = (n: number) => n.toLocaleString("en");

type Props = {
  /** What the nav is called to a screen reader, e.g. "Product pages". */
  label: string;
  /** The page shown (from 1), and the page a click is loading (null when none). */
  page: number;
  loading?: number | null;
  totalPages: number;
  /** Rows in the whole list, rows per page, and rows on this page: the "Showing 51–100 of 1,393" line. */
  total: number;
  pageSize: number;
  shown: number;
  /** In-page paging (the table fetches its own rows)… */
  onPage?: (page: number) => void;
  /** …or plain links: this URL with `page` set (left out for page 1). A full page load, like the admin filters. */
  link?: string;
  /** A rows-per-page picker, when the list takes a size. */
  sizes?: readonly number[];
  onSize?: (size: number) => void;
};

/**
 * Under a paged list: the range shown, Previous / numbered pages / Next (a gap where pages are left out; "3 of 28" on
 * a phone), and an optional rows-per-page picker. While a page loads its number lights up and the range line becomes
 * "Loading page N…".
 */
export function Pagination({ label, page, loading = null, totalPages, total, pageSize, shown, onPage, link, sizes, onSize }: Props) {
  // A link click starts a full page load: show it as loading until the browser leaves.
  const [leaving, setLeaving] = useState<number | null>(null);
  // Back to this page from the browser's cache: it never left, so it isn't loading.
  useEffect(() => {
    const back = (e: PageTransitionEvent) => e.persisted && setLeaving(null);
    window.addEventListener("pageshow", back);
    return () => window.removeEventListener("pageshow", back);
  }, []);
  const pending = loading ?? leaving;
  const at = pending ?? page;
  // Nothing to page, or a page past the end (the admin lists link back to page 1 there).
  if (total === 0 || shown === 0) return null;

  const hrefOf = (n: number) => {
    if (!link) return undefined;
    const url = new URL(link, "http://x");
    if (n > 1) url.searchParams.set("page", String(n));
    else url.searchParams.delete("page");
    return url.pathname + url.search;
  };
  const go = (n: number) => (link ? setLeaving(n) : onPage?.(n));
  // A button, or a link styled as one: the same look either way. A function, not a component, so React keeps the
  // same elements (and keyboard focus) between renders.
  const turn = (to: number, props: React.ComponentProps<typeof Button>, children: React.ReactNode, key?: number) =>
    link && !props.disabled ? (
      <Button key={key} asChild {...props}>
        <a href={hrefOf(to)} onClick={() => go(to)}>
          {children}
        </a>
      </Button>
    ) : (
      <Button key={key} onClick={() => go(to)} {...props}>
        {children}
      </Button>
    );

  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 pt-1">
      {pending === null ? (
        <p className="text-sm text-muted-foreground tabular-nums">
          Showing {count((page - 1) * pageSize + 1)}–{count((page - 1) * pageSize + shown)} of {count(total)}
        </p>
      ) : (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground tabular-nums">
          <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
          Loading page {count(pending)}…
        </p>
      )}
      {totalPages > 1 ? (
        <div className="flex items-center gap-1">
          {turn(
            at - 1,
            { disabled: at <= 1, variant: "outline", size: "sm" },
            <>
              <ChevronLeft aria-hidden="true" />
              Previous
            </>,
          )}
          {/* Page numbers from sm up; a phone gets "3 of 28" between the arrows. */}
          <span className="px-2 text-sm text-muted-foreground tabular-nums sm:hidden">
            {at} of {totalPages}
          </span>
          <span className="hidden items-center gap-1 sm:flex">
            {pageItems(at, totalPages).map((it, i) =>
              it === "gap" ? (
                <span key={`gap-${i}`} aria-hidden="true" className="px-1 text-muted-foreground">
                  …
                </span>
              ) : it === at ? (
                <Button key={it} size="sm" aria-label={`Page ${it}`} aria-current="page" className="min-w-9 tabular-nums">
                  {it}
                </Button>
              ) : (
                turn(it, { size: "sm", variant: "ghost", "aria-label": `Page ${it}`, className: "min-w-9 tabular-nums" }, it, it)
              ),
            )}
          </span>
          {turn(
            at + 1,
            { disabled: at >= totalPages, variant: "outline", size: "sm" },
            <>
              Next
              <ChevronRight aria-hidden="true" />
            </>,
          )}
        </div>
      ) : null}
      {sizes && onSize ? (
        <label className="flex shrink-0 items-center gap-2 text-sm whitespace-nowrap text-muted-foreground">
          Rows per page
          <select value={pageSize} onChange={(e) => onSize(Number(e.target.value))} className={cn(selectClass, "w-auto")}>
            {sizes.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </nav>
  );
}
