"use client";

import { useCallback, useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";
import { PageSection } from "@/components/ui/page-section";
import { cn } from "@/lib/utils";

/**
 * The page column's width (rem) below which the list and the open item stack. It must match the `@3xl` (48rem) in
 * ListDetail's grid: the split follows the column, not the window, since the sidebar and assistant take part of a wide window.
 */
const STACK_BELOW_REM = 48;

/**
 * A list card beside the open item (Quotes, Blog): two panes from a 48rem page column, stacked below it. `placeholder`
 * shows in the detail pane while nothing is open (an EmptyState with `variant="card"`).
 */
export function ListDetail({ containerRef, list, detail, placeholder }: { containerRef: RefObject<HTMLDivElement | null>; list: ReactNode; detail: ReactNode; placeholder: ReactNode }) {
  return (
    <div ref={containerRef} className="@container">
      {/* One shrinkable column when stacked: an implicit column would size to the longest row and run past a phone's edge. */}
      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 @3xl:grid-cols-[18rem_minmax(0,1fr)]">
        {list}
        {detail ?? placeholder}
      </div>
    </div>
  );
}

/** The list pane: a PageSection whose rows run edge to edge, with an optional block (a small form) above them. */
export function ListCard({ id, title, description, top, children }: { id: string; title: string; description?: ReactNode; top?: ReactNode; children: ReactNode }) {
  return (
    <PageSection id={id} title={title} description={description} className="px-0 py-2">
      {top ? <div className="px-5 pb-3 pt-1">{top}</div> : null}
      <ul className="flex flex-col">{children}</ul>
    </PageSection>
  );
}

/** One row of a ListCard: a button that opens the item; the open one is tinted and marked `aria-current`. */
export function ListRow({ selected, onSelect, className, children }: { selected: boolean; onSelect: () => void; className?: string; children: ReactNode }) {
  return (
    <li>
      <button
        type="button"
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        className={cn(
          "flex w-full gap-2 px-5 py-3 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:py-3.5",
          selected && "bg-accent hover:bg-accent",
          className,
        )}
      >
        {children}
      </button>
    </li>
  );
}

/**
 * Takes the reader to the open item's section (`<id>-h`, a PageSection heading) after the render that shows it:
 * `reveal("stacked")` only when the panes are stacked (the item opened below the list), `reveal("always")` when the
 * control that held focus is gone (New quote in an empty state unmounts once the list exists). Scrolls the heading to
 * the top and focuses it without a second scroll. Pass the open item's id as `selected`.
 */
export function useRevealSection(id: string, selected: string | null) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pending = useRef<"stacked" | "always" | null>(null);
  useLayoutEffect(() => {
    const mode = pending.current;
    pending.current = null;
    if (!mode || !selected) return;
    const heading = document.getElementById(`${id}-h`);
    const box = containerRef.current;
    if (!heading || !box) return;
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    if (mode === "stacked" && box.clientWidth >= STACK_BELOW_REM * rem) return;
    heading.setAttribute("tabindex", "-1");
    heading.scrollIntoView({ block: "start" });
    heading.focus({ preventScroll: true });
  }, [id, selected]);
  const reveal = useCallback((mode: "stacked" | "always") => {
    pending.current = mode;
  }, []);
  return { containerRef, reveal };
}
