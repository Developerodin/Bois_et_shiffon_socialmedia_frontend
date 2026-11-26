"use client";

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { focusSectionHeading, PageSection } from "@/components/ui/page-section";
import { cn } from "@/lib/utils";

/**
 * A list card beside the open item (Quotes, Blog): two panes from a 48rem page column (`@3xl`), stacked below it. The
 * split follows the column, not the window, since the sidebar and assistant take part of a wide window. `placeholder`
 * shows in the detail pane while nothing is open (an EmptyState with `variant="card"`).
 */
export function ListDetail({ list, detail, placeholder }: { list: ReactNode; detail: ReactNode; placeholder: ReactNode }) {
  return (
    <div className="@container">
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

/** The shell's top bar (h-18) covers the top of the scrolling page: a heading under it isn't in sight. */
const TOP_BAR_PX = 72;
/** A heading closer than this to the window's bottom edge counts as out of sight (its section starts below the fold). */
const BOTTOM_MARGIN_PX = 96;

type Pending = { kind: "open"; mode: "if-hidden" | "always" } | { kind: "closed" };

/**
 * Which item of a ListDetail is open, and where the reader is taken after the render that shows the change:
 * - `open(id)`: to the item's section heading (`<item>-h`) only when it is out of sight (stacked below the list, or a
 *   low row on a long list), else nowhere, so a click in the list keeps its place.
 * - `open(id, "always")`: always, for when the control that held focus is gone (an empty state, a step, a task button).
 * - `closed()`: the item was deleted or archived; to the list's heading (`<list>-h`), or `emptyHeadingId` once nothing is left.
 * `ids` are the ids it looks for: give them to the item's PageSection, the ListCard and the EmptyState's heading.
 */
export function useListSelection({ item, list, emptyHeadingId }: { item: string; list: string; emptyHeadingId: string }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const pending = useRef<Pending | null>(null);
  useLayoutEffect(() => {
    const p = pending.current;
    pending.current = null;
    if (!p) return;
    if (p.kind === "closed") {
      const target = document.getElementById(`${list}-h`) ? list : null;
      if (target) focusSectionHeading(target);
      else {
        const empty = document.getElementById(emptyHeadingId);
        empty?.setAttribute("tabindex", "-1");
        empty?.focus();
      }
      return;
    }
    const heading = document.getElementById(`${item}-h`);
    if (!heading) return;
    const top = heading.getBoundingClientRect().top;
    if (p.mode === "if-hidden" && top >= TOP_BAR_PX && top <= window.innerHeight - BOTTOM_MARGIN_PX) return;
    heading.scrollIntoView({ block: "start" });
    focusSectionHeading(item);
  }, [item, list, emptyHeadingId, selected, tick]);
  const open = useCallback(
    (id: string, mode: "if-hidden" | "always" = "if-hidden") => {
      if (id === selected && mode === "if-hidden") return;
      pending.current = { kind: "open", mode };
      setSelected(id);
      setTick((t) => t + 1);
    },
    [selected],
  );
  const closed = useCallback(() => {
    pending.current = { kind: "closed" };
    setSelected(null);
    setTick((t) => t + 1);
  }, []);
  return { selected, open, closed, ids: { item, list, emptyHeading: emptyHeadingId } };
}
