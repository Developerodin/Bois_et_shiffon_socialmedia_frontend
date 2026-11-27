"use client";

import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TONE_DOT, type Tone } from "@/lib/status";
import { AGENDA_BELOW, CELL_FLOOR, dayCards, dayCellLabel, dayKey, gridStep, itemCount, monthGrid, popoverLeft, popoverSide, type CardForm, type Noun } from "@/lib/calendar-month";
import { cn } from "@/lib/utils";

/** The gap (px) between day cells and between weeks. */
const CELL_GAP = 5;
// A day cell's size before its first measurement (three one-line cards); ResizeObserver replaces it at once.
const CELL_SIZE = { h: 94, w: 0 };

const POPOVER_W = 288; // w-72
const POPOVER_MAX_H = 320; // what max-h-80 was
// The close animation is 150 ms; the popover unmounts after this (under reduced motion it is hidden at once meanwhile).
const POPOVER_EXIT_MS = 200;

/** Where a day popover sits in MonthGrid's box: its left edge, and its top (below the cell) or bottom (above it). */
type PopoverAt = { left: number; top?: number; bottom?: number; maxHeight: number };

/** "New post" on an empty day: the button's label and what it does with the day (YYYY-MM-DD). */
export type NewItem = { label: string; onNew: (day: string) => void };

/**
 * A day's items in a popover by its cell (the caller's `list`), each opening its item. Focus moves in on open; Esc, the
 * close button or a press outside close it, and the caller gives focus back to the cell. It opens below the cell, or
 * above it when there is more room there (popoverSide), and is never taller than that room, so the scrolling page never
 * clips it. An empty day offers the new-item button when `onNew` is given. Fades and scales in from 0.96 with a 4 px
 * slide from the cell (opacity and transform only), and back out on close.
 * ponytail: not Radix Popover (not installed).
 */
function DayPopover({ label, count, noun, open, at, cell, onClose, onExited, newLabel, onNew, children }: {
  label: string;
  count: number;
  noun: Noun;
  open: boolean;
  at: PopoverAt;
  cell: () => HTMLElement | null | undefined;
  onClose: () => void;
  onExited: () => void;
  newLabel?: string;
  onNew?: () => void;
  children: ReactNode;
}) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const head = useRef<HTMLHeadingElement>(null);
  // Mounted in the closed pose, then opened on the next frame so the transition has a start.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    head.current?.focus({ preventScroll: true });
    // Bring it into view (a bottom-row day in a short panel would otherwise open out of sight).
    const f = requestAnimationFrame(() => {
      setEntered(true);
      box.current?.scrollIntoView({ block: "nearest" });
    });
    return () => cancelAnimationFrame(f);
  }, []);
  useEffect(() => {
    if (open) return;
    const t = setTimeout(onExited, POPOVER_EXIT_MS);
    return () => clearTimeout(t);
  }, [open, onExited]);
  // A press outside closes it; a press on its own cell is left to the cell's click, which toggles it.
  useEffect(() => {
    if (!open) return;
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!box.current?.contains(t) && !cell()?.contains(t)) onClose();
    };
    document.addEventListener("pointerdown", down);
    return () => document.removeEventListener("pointerdown", down);
  }, [open, cell, onClose]);
  const shown = open && entered;
  const above = at.bottom !== undefined;
  return (
    <div
      ref={box}
      role="dialog"
      aria-labelledby={titleId}
      // Esc is used up here, so a side preview around the calendar doesn't close as well.
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onClose();
      }}
      style={{ left: at.left, top: at.top, bottom: at.bottom, width: POPOVER_W, maxHeight: at.maxHeight }}
      className={cn(
        "absolute z-20 flex max-w-full flex-col gap-1 overflow-y-auto rounded-2xl border border-border bg-popover p-2 text-popover-foreground shadow-lg transition-[opacity,translate,scale] duration-150 ease-out motion-reduce:transition-none",
        above ? "origin-bottom-left" : "origin-top-left",
        shown ? "translate-y-0 scale-100 opacity-100" : cn("pointer-events-none scale-[0.96] opacity-0", above ? "translate-y-1" : "-translate-y-1"),
      )}
    >
      <div className="flex items-center gap-2 pl-2">
        <h4 id={titleId} ref={head} tabIndex={-1} className="mr-auto text-xs font-semibold focus-visible:outline-none">
          {count ? <>{label} &middot; {itemCount(count, noun)}</> : `Nothing on ${label}`}
        </h4>
        <Button size="sm" variant="ghost" className="w-8 px-0" aria-label="Close this day" onClick={onClose}>
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      {children}
      {!count && onNew && newLabel && (
        <div className="px-2 pb-1">
          <Button
            size="sm"
            onClick={() => {
              onClose();
              onNew();
            }}
          >
            <Plus aria-hidden="true" />
            {newLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

export type MonthGridProps<T> = {
  month: { y: number; m: number };
  /** The id of the month's heading (in the caller's toolbar), which names the grid. */
  headId: string;
  /** The items by day key (YYYY-MM-DD), already filtered; keys outside the grid are ignored. */
  byDay: Map<string, T[]>;
  idOf: (item: T) => string;
  /** The item open in the side peek, marked on its card. */
  selectedId: string | null;
  onOpen: (id: string) => void;
  /** One item's card in a wide cell, drawn in `form` (dayCards). It must not be a tab stop: the day's cell is. */
  card: (item: T, form: CardForm, selected: boolean) => ReactNode;
  /** A day's items as a list of rows (the popover's and the narrow agenda's), each calling `onPick` with its id. */
  dayList: (items: T[], onPick: (id: string) => void) => ReactNode;
  /** What the day cell's accessible name says of an item. */
  summary: (item: T) => { title: string; time: string | null; status: string };
  /** An item's status colour, for the narrow month's dots. */
  tone: (item: T) => Tone;
  /** What is counted: ["post", "posts"]. */
  noun: Noun;
  /** "Nothing planned this month": shown when no day of the month has an item. */
  emptyMonth: string;
  /** New item on an empty day (popover and agenda). */
  newItem?: NewItem;
  /** The caller's load gate around the grid: a skeleton or the retry until the month has loaded. */
  gate: (children: ReactNode) => ReactNode;
  /** Above the gate (always shown), inside it before the grid, and after the grid (a legend). */
  top?: ReactNode;
  notes?: ReactNode;
  footer?: ReactNode;
  /** Whether the month has loaded: the cells are measured once it has. */
  loaded: boolean;
};

/**
 * A calendar month as a grid (weeks start Monday) over any kind of item; the caller fetches, filters and draws the items
 * (the content calendar's posts, the task calendar's tasks). Each day is a button under its cards; arrow keys move
 * between days (the grid is one tab stop). From AGENDA_BELOW px wide, the weeks share the height the page leaves them
 * (each at least CELL_FLOOR), each day shows as many cards as its height holds (dayCards) and then "+N more", and a day
 * opens a popover listing all its items; a card opens its item. Under that width days show status dots and a tapped day
 * lists its items under the grid (an agenda), as phone calendars do, since a popover over a 45 px cell covers the grid
 * it belongs to. A CSS grid with ARIA table roles, not a <table>: table rows size to their content and won't share a
 * height. Needs an `@container/cal` ancestor (the narrow classes test it). This box is the one the popover is placed in
 * and the narrow width measured on, so it stays `relative flex flex-1 flex-col`.
 * ponytail: no drag to reschedule, no week view.
 */
export function MonthGrid<T>({ month, headId, byDay, idOf, selectedId, onOpen, card, dayList, summary, tone, noun, emptyMonth, newItem, gate, top, notes, footer, loaded }: MonthGridProps<T>) {
  // The day whose popover shows (its key) and where; `open` is false while it closes.
  const [pop, setPop] = useState<{ key: string; open: boolean; at: PopoverAt } | null>(null);
  // The day last focused: it holds the grid's one tab stop.
  const [cursor, setCursor] = useState<string | null>(null);
  // The narrow month's chosen day, whose items the agenda lists.
  const [picked, setPicked] = useState<string | null>(null);
  const grid = useMemo(() => monthGrid(month.y, month.m), [month]);
  // Another month closes the open day.
  useEffect(() => setPop(null), [month]);
  const today = dayKey(new Date());
  const agendaId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  // Whether the panel is under AGENDA_BELOW px: the same width the @min-[640px]/cal classes test (this box fills the panel).
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setNarrow(el.clientWidth < AGENDA_BELOW));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // A day cell's measured size (every cell is the same), which sets how many cards a day shows and in which form
  // (dayCards). Watches the weeks' box, which is there once the month has loaded.
  const weeksBox = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(CELL_SIZE);
  useEffect(() => {
    const el = weeksBox.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const cell = el.querySelector<HTMLElement>("[role=cell]");
      if (cell) setCellSize((s) => (s.h === cell.offsetHeight && s.w === cell.offsetWidth ? s : { h: cell.offsetHeight, w: cell.offsetWidth }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [loaded, narrow, grid.length]);
  const cellOf = useCallback((k: string) => wrap.current?.querySelector<HTMLElement>(`[data-day="${k}"]`), []);
  const openDay = (k: string) => {
    const el = cellOf(k);
    if (!el) return;
    const box = wrap.current!.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    // The room above and below inside the scrolling main area (else the window), which would clip the popover.
    const scroller = wrap.current!.closest("main")?.getBoundingClientRect() ?? { top: 0, bottom: window.innerHeight };
    const { side, maxHeight } = popoverSide(scroller.bottom - r.bottom - 4, r.top - scroller.top - 4, POPOVER_MAX_H);
    const left = popoverLeft(r.left - box.left, POPOVER_W, box.width);
    setPop({ key: k, open: true, at: side === "below" ? { left, top: r.bottom - box.top + 4, maxHeight } : { left, bottom: box.bottom - r.top + 4, maxHeight } });
  };
  // Closing gives focus back to the day's cell.
  const closeDay = useCallback(() => {
    if (!pop?.open) return;
    cellOf(pop.key)?.focus();
    setPop({ ...pop, open: false });
  }, [pop, cellOf]);
  const popCell = useCallback(() => (pop ? cellOf(pop.key) : null), [pop, cellOf]);
  const popExited = useCallback(() => setPop((p) => (p && !p.open ? null : p)), []);
  const inMonth = grid.filter((d) => d.getMonth() === month.m).reduce((n, d) => n + (byDay.get(dayKey(d))?.length ?? 0), 0);
  const weeks = Array.from({ length: grid.length / 7 }, (_, w) => grid.slice(w * 7, w * 7 + 7));
  const keys = grid.map(dayKey);
  // The tab stop: the day last focused if it's on this grid, else today if shown, else the 1st.
  const stop = cursor && keys.includes(cursor) ? cursor : keys.includes(today) ? today : dayKey(new Date(month.y, month.m, 1));
  // The agenda's day: the one tapped if it's on this grid, else the tab stop's.
  const agendaKey = picked && keys.includes(picked) ? picked : stop;
  const dayLabel = (d: Date) => d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const popDay = pop ? grid[keys.indexOf(pop.key)] : undefined;
  const agendaDay = grid[keys.indexOf(agendaKey)];
  const agendaItems = byDay.get(agendaKey) ?? [];
  const many = noun[1].charAt(0).toUpperCase() + noun[1].slice(1);
  return (
    <div ref={wrap} className="relative flex flex-1 flex-col gap-2 px-4 pt-2 pb-2 @max-[640px]/cal:px-1">
      {top}
      {gate(
        <>
          {inMonth === 0 && <p className="text-xs text-muted-foreground">{emptyMonth}</p>}
          {notes}
          <div role="table" aria-labelledby={headId} className={cn("flex flex-col gap-1.5 text-xs", !narrow && "flex-1")}>
            <div role="rowgroup">
              <div role="row" className="grid grid-cols-7 gap-[5px] @max-[640px]/cal:gap-x-0">
                {grid.slice(0, 7).map((d) => (
                  <div key={d.getDay()} role="columnheader" className="px-1.5 text-left text-xs font-semibold uppercase leading-4 tracking-wide text-foreground/70 @max-[640px]/cal:px-0 @max-[640px]/cal:text-center">
                    <abbr title={d.toLocaleDateString(undefined, { weekday: "long" })} className="no-underline">
                      {d.toLocaleDateString(undefined, { weekday: "short" })}
                    </abbr>
                  </div>
                ))}
              </div>
            </div>
            <div
              ref={weeksBox}
              role="rowgroup"
              // Wide: the weeks share what height is left, each at least CELL_FLOOR (the floor is also the box's minimum,
              // so a short window scrolls the page instead of squeezing the days). Narrow: rows as tall as their days.
              className={cn("grid", !narrow && "flex-1")}
              style={{ gap: CELL_GAP, ...(narrow ? {} : { gridTemplateRows: `repeat(${weeks.length}, minmax(${CELL_FLOOR}px, 1fr))`, minHeight: weeks.length * CELL_FLOOR + (weeks.length - 1) * CELL_GAP }) }}
              // Arrow keys move between days, a week up or down; the focused day becomes the grid's tab stop.
              onKeyDown={(e) => {
                const k = (e.target as HTMLElement).dataset.day;
                if (e.key === "Escape" && pop?.open) {
                  e.preventDefault();
                  return closeDay();
                }
                const n = k ? gridStep(keys.indexOf(k), e.key, keys.length) : null;
                if (n === null) return;
                e.preventDefault();
                cellOf(keys[n])?.focus();
              }}
            >
              {weeks.map((week) => (
                <div key={dayKey(week[0])} role="row" className="grid min-h-0 grid-cols-7 gap-[5px] @max-[640px]/cal:gap-x-0">
                  {week.map((d) => {
                    const k = dayKey(d);
                    const items = byDay.get(k) ?? [];
                    const isOpen = !narrow && pop?.key === k && pop.open;
                    const isPicked = narrow && agendaKey === k;
                    const isToday = k === today;
                    const outside = d.getMonth() !== month.m;
                    const fit = dayCards(items.length, cellSize.h, cellSize.w);
                    // The open item behind "+N more" marks that button instead, so its day still shows.
                    const selectedHidden = !!selectedId && items.slice(fit.shown).some((i) => idOf(i) === selectedId);
                    return (
                      <div
                        key={k}
                        role="cell"
                        className={cn(
                          // The cell clips: its height comes from the row, never from its cards (cardsThatFit sizes those).
                          "@container/cell relative min-h-0 min-w-0 overflow-hidden rounded-lg border border-border @max-[640px]/cal:min-h-11 @max-[640px]/cal:border-transparent",
                          // The month's days are white; days of the next or last month sit on a muted fill with muted dates.
                          outside ? "bg-muted/60" : "bg-card",
                          // Today is marked by its date alone (a dark circle). The chosen day (popover or agenda open) gets
                          // the --control outline chosen tabs use and a faint fill; the open item marks its own card.
                          (isOpen || isPicked) && "z-[1] border-control bg-accent/40 ring-1 ring-control @max-[640px]/cal:border-control",
                        )}
                      >
                        {/* The day itself: a button under the cards, filling the cell. It opens the day's popover, or on a
                            narrow panel picks the agenda's day. Its name reads the day's items, which the cards show cut short. */}
                        <button
                          type="button"
                          data-day={k}
                          tabIndex={k === stop ? 0 : -1}
                          aria-label={dayCellLabel(dayLabel(d), items.map(summary), noun)}
                          aria-current={isToday ? "date" : undefined}
                          {...(narrow ? { "aria-pressed": isPicked, "aria-controls": agendaId } : { "aria-haspopup": "dialog" as const, "aria-expanded": isOpen })}
                          onFocus={() => setCursor(k)}
                          onClick={() => (narrow ? setPicked(k) : isOpen ? closeDay() : openDay(k))}
                          className="absolute inset-0 rounded-lg transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                        />
                        {/* What the cell shows, over the button. Clicks pass through to it, except on a card or "+N more".
                            Absolute, so the cards never give the row a height of their own: the row sizes the cell, the
                            cell's measured height sizes the cards (cardsThatFit). In flow they would hold the row at
                            whatever height the last count of cards needed. */}
                        <div className="pointer-events-none absolute inset-0 flex flex-col gap-0.5 px-1 pt-1 pb-0.5 @max-[640px]/cal:items-center">
                          <span
                            aria-hidden
                            className={cn(
                              "flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular-nums",
                              outside ? "text-muted-foreground/80" : "text-foreground",
                              isToday && "bg-primary font-semibold text-primary-foreground",
                            )}
                          >
                            {d.getDate()}
                          </span>
                          {items.length > 0 &&
                            (narrow ? (
                              // Narrow panel: a dot per item in its status colour (the agenda below names each one); the open item's is ringed.
                              <span aria-hidden className="flex items-center gap-0.5">
                                {items.slice(0, 3).map((i) => <span key={idOf(i)} className={cn("size-1.5 rounded-full", TONE_DOT[tone(i)], idOf(i) === selectedId && "ring-1 ring-foreground ring-offset-1")} />)}
                                {items.length > 3 && <span className="leading-none text-muted-foreground">+{items.length - 3}</span>}
                              </span>
                            ) : (
                              <>
                                {items.slice(0, fit.shown).map((i) => (
                                  <Fragment key={idOf(i)}>{card(i, fit.form, idOf(i) === selectedId)}</Fragment>
                                ))}
                                {fit.more > 0 && (
                                  // Opens the day's popover, which lists every item: no item is ever out of reach.
                                  <button
                                    type="button"
                                    tabIndex={-1}
                                    onClick={() => (isOpen ? closeDay() : openDay(k))}
                                    aria-current={selectedHidden ? "true" : undefined}
                                    className={cn("pointer-events-auto h-5 shrink-0 self-start rounded-md px-1.5 text-left text-xs font-semibold text-foreground underline-offset-2 hover:bg-muted hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", selectedHidden && "bg-accent ring-1 ring-foreground")}
                                  >
                                    +{fit.more} more
                                  </button>
                                )}
                              </>
                            ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          {narrow && agendaDay && (
            <section id={agendaId} aria-label={`${many} on the chosen day`} className="flex flex-col gap-1 border-t border-border pt-2">
              <h3 aria-live="polite" className="px-2 text-xs font-semibold">
                {agendaItems.length ? <>{dayLabel(agendaDay)} &middot; {itemCount(agendaItems.length, noun)}</> : `Nothing on ${dayLabel(agendaDay)}`}
              </h3>
              {agendaItems.length ? dayList(agendaItems, onOpen) : null}
              {!agendaItems.length && newItem && (
                <div className="px-2">
                  <Button size="sm" onClick={() => newItem.onNew(agendaKey)}>
                    <Plus aria-hidden="true" />
                    {newItem.label}
                  </Button>
                </div>
              )}
            </section>
          )}
          {footer}
        </>,
      )}
      {!narrow && pop && popDay && (
        <DayPopover
          key={pop.key}
          label={dayLabel(popDay)}
          count={(byDay.get(pop.key) ?? []).length}
          noun={noun}
          open={pop.open}
          at={pop.at}
          cell={popCell}
          onClose={closeDay}
          onExited={popExited}
          newLabel={newItem?.label}
          onNew={newItem && (() => newItem.onNew(pop.key))}
        >
          {(byDay.get(pop.key) ?? []).length
            ? dayList(byDay.get(pop.key) ?? [], (id) => {
                // Closed first, so focus is back on the cell when the item opens: the preview returns focus there.
                closeDay();
                onOpen(id);
              })
            : null}
        </DayPopover>
      )}
    </div>
  );
}


/**
 * One item as a month card: a quiet fill, a hairline border and a thin left edge in its `tone`. Its `form` comes from
 * dayCards, whose steps in calendar-month.ts count on these heights: "stacked2" and "stacked" put `top` small and muted
 * above the title (two lines of title, at most 50 px, or one, 34 px); "line" (28 px) and "compact" (20 px) are one line,
 * `lead` and the title. The title is cut short with an ellipsis; the day's popover lists it in full. It is not a tab
 * stop: the day's cell is, and its popover lists the same items for the keyboard. `about` (everything the card cuts
 * short) is its tooltip and accessible name. `selected`: the item open in the side peek, outlined so its day reads at a
 * glance. The content calendar's PostCard and the task calendar's TaskCard are this card.
 */
export function CalendarCard({ form, tone, selected, about, onClick, top, lead, title }: {
  form: CardForm;
  tone: Tone;
  selected: boolean;
  about: string;
  onClick: () => void;
  top?: ReactNode;
  lead?: ReactNode;
  title: string;
}) {
  const stacked = form === "stacked" || form === "stacked2";
  return (
    <button
      type="button"
      tabIndex={-1}
      onClick={onClick}
      title={about}
      aria-label={about}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "pointer-events-auto relative flex w-full min-w-0 shrink-0 overflow-hidden rounded-md border pl-2.5 pr-1.5 text-left text-xs leading-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-foreground bg-accent ring-1 ring-foreground" : "border-border/70 bg-background hover:border-control hover:bg-muted",
        form === "stacked2" ? "max-h-[50px] min-h-[34px] flex-col justify-center py-0.5" : form === "stacked" ? "h-[34px] flex-col justify-center" : cn("items-center gap-1.5", form === "line" ? "h-7" : "h-5"),
      )}
    >
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_DOT[tone])} />
      {stacked ? top : lead}
      <span data-card-title className={cn("min-w-0 font-medium text-foreground", form === "stacked2" ? "line-clamp-2 break-words" : "truncate")}>{title}</span>
    </button>
  );
}

/** One row of a day's list (the popover's and the narrow agenda's): `meta` muted at the left, `status` at the right, the title below. */
export function DayRow({ onClick, meta, status, title }: { onClick: () => void; meta: ReactNode; status: ReactNode; title: string }) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex w-full flex-col gap-0.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring pointer-coarse:min-h-11"
      >
        <span className="flex items-center justify-between gap-2 text-xs">
          <span className="min-w-0 text-muted-foreground">{meta}</span>
          {status}
        </span>
        <span className="text-sm">{title}</span>
      </button>
    </li>
  );
}
