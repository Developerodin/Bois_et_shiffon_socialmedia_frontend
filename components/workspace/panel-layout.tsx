"use client";

import { Fragment, useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight, GripVertical, LayoutPanelLeft, MoreHorizontal, RotateCcw, X } from "lucide-react";
import { SHELL_STROKE, tool } from "@/components/shell/icon";
import { TOPBAR_SLOT_ID } from "@/components/shell/top-bar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { arrow, drag, KEY_STEP, split } from "@/components/workspace/resize";

/**
 * VS Code-style free layout: columns of stacked panels. Drag a panel by its header to another
 * column, onto another panel (inserts before it) or to the right edge (new column); drag the
 * dividers to resize (between columns, and between two expanded panels in a column); every move
 * also has a keyboard path in the panel's menu.
 * ponytail: a panel's height is a weight against its column's other expanded panels, so moving it to
 * another column (or hiding it) drops its weight back to 1; there's no pixel-exact height to keep.
 */
export type PanelDef<Id extends string> = { id: Id; title: string; icon: ReactNode; render: () => ReactNode; actions?: ReactNode };
type Column<Id extends string> = { id: string; size: number; panels: Id[] };
/** `heights`: each expanded panel's share of its column's height (flex-grow), 1 when missing. */
export type Layout<Id extends string> = { columns: Column<Id>[]; collapsed: Id[]; heights?: Partial<Record<Id, number>> };
export type Preset<Id extends string> = { name: string; description: string; layout: Layout<Id> };

const MIN_PX = 240;
// A panel dragged smaller keeps its header (44 px), a 120 px body and its borders.
const MIN_PANEL_PX = 166;
// Matches Tailwind's lg breakpoint. Only the layout on screen renders panels: rendering both (one hidden
// by CSS) would mount every panel twice, double the polling, duplicate element ids and split edit state.
// A panel shown in the side preview (`previewing`) is left out of the board while it's there, so it isn't mounted twice.
const WIDE = "(min-width: 1024px)";
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
let seq = 0;
const colId = () => `c${Date.now().toString(36)}${seq++}`;

/** What bringing a panel into view needs: nothing but a scroll, an expand, or adding it to a column. */
export function revealPlan<Id extends string>(layout: Layout<Id>, id: Id): "scroll" | "expand" | "add" {
  if (!layout.columns.some((c) => c.panels.includes(id))) return "add";
  return layout.collapsed.includes(id) ? "expand" : "scroll";
}
/** The layout with this panel expanded and, if it was in no column, put at the top of the second column. */
export function withPanel<Id extends string>(l: Layout<Id>, id: Id): Layout<Id> {
  const open = { ...l, collapsed: l.collapsed.filter((p) => p !== id) };
  if (l.columns.some((c) => c.panels.includes(id))) return open;
  const columns = open.columns.length ? open.columns.map((c, i) => (i === Math.min(1, open.columns.length - 1) ? { ...c, panels: [id, ...c.panels] } : c)) : [{ id: colId(), size: 1, panels: [id] }];
  return { ...open, columns };
}
const FLASH = ["outline", "outline-2", "outline-primary", "outline-offset-2"];
const FLASH_MS = 1200;

export function sanitize<Id extends string>(raw: unknown, ids: Id[], fallback: Layout<Id>): Layout<Id> {
  const l = raw as Layout<Id> | null;
  if (!l || !Array.isArray(l.columns)) return fallback;
  const seen = new Set<Id>();
  const columns = l.columns
    .map((c) => ({ id: String(c.id ?? colId()), size: Number(c.size) > 0 ? Number(c.size) : 1, panels: (c.panels ?? []).filter((p) => ids.includes(p) && !seen.has(p) && seen.add(p)) }))
    .filter((c) => c.panels.length);
  // Saved before panel heights existed, or a bad weight (not a number, or too small to be a real share): missing, so 1.
  const heights = Object.fromEntries(Object.entries(l.heights ?? {}).filter(([p, w]) => ids.includes(p as Id) && typeof w === "number" && w >= 0.05 && Number.isFinite(w))) as Layout<Id>["heights"];
  return columns.length ? { columns, collapsed: (l.collapsed ?? []).filter((p) => ids.includes(p)), heights } : fallback;
}

/** What a screen reader hears after a panel is moved or hidden (WCAG 4.1.3). */
export function layoutMessage<Id extends string>(title: string, layout: Layout<Id>, id: Id): string {
  const i = layout.columns.findIndex((c) => c.panels.includes(id));
  return i < 0 ? `${title} hidden` : `${title} moved to column ${i + 1} of ${layout.columns.length}`;
}

export function PanelLayout<Id extends string>({
  panels,
  presets,
  storageKey,
  focus,
  revealRef,
  onOpenInPeek,
  previewing,
}: {
  panels: PanelDef<Id>[];
  presets: Preset<Id>[];
  storageKey: string;
  /** Bring this panel into view (re-shown if hidden, selected on phones); change `n` to re-trigger. */
  focus?: { id: Id; n: number };
  /** Filled with a function that points at a panel: scrolls to it and flashes it, expanding or adding it first (saved) when it isn't showing. */
  revealRef?: { current: ((id: Id) => void) | null };
  /** Show a panel in the side preview without changing the layout: adds a drop zone on the right edge and a menu item. */
  onOpenInPeek?: (id: Id) => void;
  /** The panel open in the side preview: not rendered on the board meanwhile (the saved layout is untouched). */
  previewing?: Id | null;
}) {
  const ids = panels.map((p) => p.id);
  const [layout, setLayout] = useState<Layout<Id>>(presets[0].layout);
  const wide = useWide();
  const [mobilePanel, setMobilePanel] = useState<Id | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [hintSeen, setHintSeen] = useState(true);
  const dragging = useRef<Id | null>(null);
  const [dragOn, setDragOn] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  // A panel moved or hidden from a menu: once the new layout renders, focus follows it and the live region says where.
  const pending = useRef<{ id: Id; title: string } | null>(null);
  const [message, setMessage] = useState("");
  // Set only by a move or hide from a panel menu: that close skips Radix's return to the (remounted or gone)
  // trigger. Escape, outside click and Collapse/Expand keep Radix's default return. Cleared by the handler,
  // which runs in Radix's setTimeout(0) after the effect below has already cleared `pending`.
  const suppressReturn = useRef(false);
  // The top bar is rendered by the shell layout, so it exists by the time this mounts.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  useEffect(() => setSlot(document.getElementById(TOPBAR_SLOT_ID)), []);

  // Load the saved arrangement once (after mount, so server and client render the same first).
  useEffect(() => {
    try {
      setHintSeen(localStorage.getItem(`${storageKey}.hint`) === "1");
      const saved = localStorage.getItem(storageKey);
      if (saved) setLayout(sanitize(JSON.parse(saved), ids, presets[0].layout));
    } catch {
      // storage blocked or corrupt: keep the preset
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const flash = useRef<{ el: Element; timer: ReturnType<typeof setTimeout> } | null>(null);
  const endFlash = () => {
    if (!flash.current) return;
    clearTimeout(flash.current.timer);
    flash.current.el.classList.remove(...FLASH);
    flash.current = null;
  };
  useEffect(() => endFlash, []);

  const commit = useCallback(
    (next: Layout<Id>) => {
      const clean = { ...next, columns: next.columns.filter((c) => c.panels.length) };
      setLayout(clean);
      try {
        localStorage.setItem(storageKey, JSON.stringify(clean));
      } catch {
        // ignore
      }
    },
    [storageKey],
  );

  const visible = layout.columns.flatMap((c) => c.panels);
  // Also drops the panel's height weight: it means nothing next to the panels of another column.
  const remove = (l: Layout<Id>, id: Id): Layout<Id> => ({
    ...l,
    columns: l.columns.map((c) => ({ ...c, panels: c.panels.filter((p) => p !== id) })),
    heights: Object.fromEntries(Object.entries(l.heights ?? {}).filter(([p]) => p !== id)) as Layout<Id>["heights"],
  });

  const move = (id: Id, target: { column: number; before?: Id } | "new-column", fromLayout = layout) => {
    const l = remove(fromLayout, id);
    // Within its own column the panel keeps its height weight; into another it starts at 1.
    const w = fromLayout.heights?.[id];
    if (target !== "new-column" && w !== undefined && fromLayout.columns[target.column]?.panels.includes(id)) l.heights = { ...l.heights, [id]: w };
    if (target === "new-column") return commit({ ...l, columns: [...l.columns, { id: colId(), size: 1, panels: [id] }] });
    const columns = l.columns.map((c, i) => {
      if (i !== target.column) return c;
      const at = target.before ? c.panels.indexOf(target.before) : -1;
      const panelsNext = [...c.panels];
      panelsNext.splice(at < 0 ? panelsNext.length : at, 0, id);
      return { ...c, panels: panelsNext };
    });
    commit({ ...l, columns });
  };

  const columnOf = (id: Id) => layout.columns.findIndex((c) => c.panels.includes(id));
  // A column holding only the panel open in the side preview isn't on screen: moves and dividers skip it.
  const offScreen = (c: { panels: Id[] }) => c.panels.every((p) => p === previewing);
  const shift = (id: Id, dir: -1 | 1) => {
    const from = columnOf(id);
    let to = from + dir;
    while (to >= 0 && to < layout.columns.length && offScreen(layout.columns[to])) to += dir;
    if (to < 0) return commit({ ...remove(layout, id), columns: [{ id: colId(), size: 1, panels: [id] }, ...remove(layout, id).columns] });
    if (to >= layout.columns.length) return move(id, "new-column");
    move(id, { column: to });
  };
  const hidden = (id: Id) => ({ ...remove(layout, id), collapsed: layout.collapsed.filter((p) => p !== id) });
  const hide = (id: Id) => commit(hidden(id));
  // Closing (X or Hide panel) offers Undo: back where it was if nothing else changed since, else back on the board.
  const close = (id: Id) => {
    const before = layout;
    const next = hidden(id);
    commit(next);
    // What commit saved (it drops emptied columns), to tell whether the board changed again before Undo.
    const after = JSON.stringify({ ...next, columns: next.columns.filter((c) => c.panels.length) });
    toast({
      title: `${def(id).title} closed`,
      detail: "Bring it back any time from Layout.",
      tone: "success",
      ms: 8000,
      // Through announce, like any panel change: focus goes to the panel's head and the live region says where it is.
      action: { label: "Undo", onAction: () => announce(id, () => commit(JSON.stringify(layoutRef.current) === after ? before : withPanel(layoutRef.current, id))) },
    });
  };
  const show = (id: Id) => {
    const last = layout.columns.length - 1;
    if (last < 0) return commit({ ...layout, columns: [{ id: colId(), size: 1, panels: [id] }] });
    move(id, { column: last });
  };
  const announce = (id: Id, change: () => void) => {
    pending.current = { id, title: panels.find((p) => p.id === id)!.title };
    change();
  };
  const fromMenu = (id: Id, change: () => void) => {
    suppressReturn.current = true;
    announce(id, change);
  };
  const toggleCollapse = (id: Id) =>
    commit({ ...layout, collapsed: layout.collapsed.includes(id) ? layout.collapsed.filter((p) => p !== id) : [...layout.collapsed, id] });

  // A divider between two neighbours (columns side by side, or expanded panels in a column) moves size from one to
  // the other, their total unchanged. `set` writes the two new sizes into a layout.
  type Pair = { a: number; b: number; set: (l: Layout<Id>, na: number, nb: number) => Layout<Id> };
  const colPair = (i: number): Pair => ({
    a: layout.columns[i].size,
    b: layout.columns[i + 1].size,
    set: (l, na, nb) => ({ ...l, columns: l.columns.map((c, j) => (j === i ? { ...c, size: na } : j === i + 1 ? { ...c, size: nb } : c)) }),
  });
  const weight = (id: Id) => layout.heights?.[id] ?? 1;
  const panelPair = (x: Id, y: Id): Pair => ({ a: weight(x), b: weight(y), set: (l, na, nb) => ({ ...l, heights: { ...l.heights, [x]: na, [y]: nb } }) });
  // Pixels per unit of a panel pair, from the two sections either side of the separator.
  const panelPx = (el: HTMLElement, p: Pair) => ((el.previousElementSibling as HTMLElement).offsetHeight + (el.nextElementSibling as HTMLElement).offsetHeight) / (p.a + p.b);
  // Drag: the layout follows the pointer and is saved on release.
  const startResize = ({ a, b, set }: Pair, pxPerUnit: number, minPx: number, axis: "x" | "y", e: React.PointerEvent) =>
    drag(
      e,
      axis,
      (px) => setLayout((l) => set(l, ...split(a, b, px / pxPerUnit, minPx / pxPerUnit))),
      () =>
        setLayout((l) => {
          try {
            localStorage.setItem(storageKey, JSON.stringify(l));
          } catch {
            // ignore
          }
          return l;
        }),
    );
  // Arrow keys: a step of the pair's total, never below `min` (in the pair's units).
  const nudge = ({ a, b, set }: Pair, min: number, axis: "x" | "y", e: React.KeyboardEvent) => {
    const dir = arrow(e.key, axis);
    if (!dir) return;
    e.preventDefault();
    commit(set(layout, ...split(a, b, dir * KEY_STEP * (a + b), min)));
  };

  const onDrop = (target: { column: number; before?: Id } | "new-column") => (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(null);
    const id = dragging.current ?? (e.dataTransfer.getData("text/panel") as Id);
    dragging.current = null;
    // A cross-column drop remounts the dragged section, so its dragend never fires.
    setDragOn(false);
    if (id && ids.includes(id)) move(id, target);
  };
  const dropInPeek = (e: React.DragEvent) => {
    e.preventDefault();
    setDropHint(null);
    const id = dragging.current ?? (e.dataTransfer.getData("text/panel") as Id);
    dragging.current = null;
    setDragOn(false);
    if (!id || !ids.includes(id)) return;
    // Focus the panel's header so the peek's close returns there (the drag leaves focus on the page).
    document.getElementById(`panel-head-${id}`)?.focus();
    onOpenInPeek?.(id);
  };
  const allow = (hint: string) => (e: React.DragEvent) => {
    if (!dragging.current) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dropHint !== hint) setDropHint(hint);
  };

  useEffect(() => {
    if (!focus) return;
    setMobilePanel(focus.id);
    setLayout((l) => withPanel(l, focus.id));
  }, [focus]);

  // Scrolls to a showing panel and flashes it. After an expand or add, it waits for the render that shows it.
  const revealAfter = useRef<Id | null>(null);
  const scrollAndFlash = (id: Id) => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(`panel-head-${id}`)?.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
    const el = document.querySelector(`[data-panel="${id}"]`);
    if (!el || reduce) return;
    endFlash();
    el.classList.add(...FLASH);
    flash.current = { el, timer: setTimeout(endFlash, FLASH_MS) };
  };
  useEffect(() => {
    const id = revealAfter.current;
    if (!id) return;
    revealAfter.current = null;
    scrollAndFlash(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, previewing]);

  if (revealRef)
    revealRef.current = (id: Id) => {
      if (!window.matchMedia(WIDE).matches) return setMobilePanel(id);
      // The panel is in the preview, which the caller is closing: it is back on the board after the next render.
      if (id === previewing) {
        revealAfter.current = id;
        return;
      }
      // A button that points at a panel opens it: a collapsed one is expanded, a missing one is added (and saved).
      if (revealPlan(layoutRef.current, id) === "scroll") return scrollAndFlash(id);
      revealAfter.current = id;
      commit(withPanel(layoutRef.current, id));
    };

  // After a move the panel's <section> remounts in its new column, so Radix's focus return target is gone:
  // focus its header button here (or Layout when hidden); the panel menu's own focus return is turned off.
  useEffect(() => {
    const p = pending.current;
    if (!p) return;
    pending.current = null;
    const shown = layout.columns.some((c) => c.panels.includes(p.id));
    // These ids assume one PanelLayout per page.
    document.getElementById(shown ? `panel-head-${p.id}` : "layout-menu")?.focus();
    const next = layoutMessage(p.title, layout, p.id);
    // An unchanged string would not re-render or re-announce, so a repeat alternates a trailing no-break space.
    setMessage((m) => (m === next ? `${next}\u00a0` : next));
  }, [layout]);

  const def = (id: Id) => panels.find((p) => p.id === id)!;
  // Phones show one panel at a time, so every panel gets a tab; the layout only arranges desktop.
  const activeMobile = mobilePanel ?? (visible.find((v) => v !== "context" as Id) ?? ids[0]);

  const layoutMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" id="layout-menu" className={tool}>
          <LayoutPanelLeft className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" /> Layout
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Presets</DropdownMenuLabel>
        {presets.map((p) => (
          <DropdownMenuItem key={p.name} onSelect={() => commit(structuredClone(p.layout))} className="flex-col items-start gap-0">
            <span>{p.name}</span>
            <span className="text-xs text-muted-foreground">{p.description}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Panels</DropdownMenuLabel>
        {/* Hiding here leaves focus in this open menu (its trap); on close Radix returns it to Layout. Intended. */}
        {/* No Undo toast for a hide here: ticking the checkbox again brings the panel back. */}
        {panels.map((p) => (
          <DropdownMenuCheckboxItem key={p.id} checked={visible.includes(p.id)} onCheckedChange={(on) => (on ? show(p.id) : announce(p.id, () => hide(p.id)))} onSelect={(e) => e.preventDefault()}>
            {p.title}
          </DropdownMenuCheckboxItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => commit(structuredClone(presets[0].layout))}>
          <RotateCcw aria-hidden="true" /> Reset to {presets[0].name}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <p aria-live="polite" className="sr-only">
        {message}
      </p>
      {wide && slot && createPortal(layoutMenu, slot)}
      {wide && !hintSeen && (
        <p className="flex items-center gap-2 px-4 pt-3 text-xs text-muted-foreground">
          Drag a panel by its header, or use its ⋯ menu, to move it. Drag the dividers or use the arrow keys to resize.
          <button
            type="button"
            className="rounded px-1.5 py-1 font-medium text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => {
              setHintSeen(true);
              try {
                localStorage.setItem(`${storageKey}.hint`, "1");
              } catch {
                // ignore
              }
            }}
          >
            Got it
          </button>
        </p>
      )}

      {/* Phones and small tablets: one panel at a time with tabs (Okara pattern). */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">{!wide && activeMobile && activeMobile !== previewing && def(activeMobile).render()}</div>
        <nav aria-label="Panels" className="flex shrink-0 overflow-x-auto border-t border-border">
          {ids.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setMobilePanel(id)}
              aria-current={activeMobile === id ? "page" : undefined}
              className={cn("flex min-w-20 flex-1 flex-col items-center gap-0.5 px-2 py-2 text-xs", activeMobile === id ? "text-foreground" : "text-muted-foreground")}
            >
              {def(id).icon}
              {def(id).title}
            </button>
          ))}
        </nav>
      </div>

      {/* Panels are cards on the page background: separation comes from the gaps, not hairlines. */}
      <div ref={rowRef} className="relative hidden min-h-0 flex-1 py-3 pl-3 lg:flex">
        {layout.columns.map((col, ci) => (
          // A column whose panels are all collapsed shrinks to a header-wide strip instead of holding its share.
          // A column left empty by the preview is hidden, with the divider before it (its neighbours can't be resized
          // against each other until the preview closes).
          <div key={col.id} className={cn("flex min-h-0 min-w-0", offScreen(col) && "hidden")} style={{ flex: col.panels.filter((p) => p !== previewing).every((p) => layout.collapsed.includes(p)) ? "0 0 15rem" : `${col.size} 1 0%` }}>
            <div
              className={cn("flex min-h-0 min-w-0 flex-1 flex-col gap-3 rounded-2xl", dropHint === `col-${ci}` && "bg-primary/5")}
              onDragOver={allow(`col-${ci}`)}
              onDragLeave={() => setDropHint(null)}
              onDrop={onDrop({ column: ci })}
            >
              {col.panels.filter((id) => id !== previewing).map((id, pi, onBoard) => {
                const p = def(id);
                const collapsed = layout.collapsed.includes(id);
                const hint = `before-${id}`;
                // A separator only between two expanded panels (the previewed one isn't on the board).
                const above = pi > 0 && !collapsed && !layout.collapsed.includes(onBoard[pi - 1]) ? panelPair(onBoard[pi - 1], id) : null;
                return (
                  <Fragment key={id}>
                  {above && (
                    <div
                      role="separator"
                      aria-orientation="horizontal"
                      aria-label="Resize panels"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round((above.a / (above.a + above.b)) * 100)}
                      tabIndex={0}
                      onPointerDown={(e) => startResize(above, panelPx(e.currentTarget, above), MIN_PANEL_PX, "y", e)}
                      onKeyDown={(e) => nudge(above, MIN_PANEL_PX / panelPx(e.currentTarget, above), "y", e)}
                      // Fills the gap between the two cards (the negative margins cancel the column's gap around it).
                      className="relative -my-3 h-3 shrink-0 cursor-row-resize touch-none outline-none after:absolute after:inset-x-4 after:top-1/2 after:h-0.5 after:-translate-y-1/2 after:rounded-full after:bg-transparent after:transition-colors after:content-[''] hover:after:bg-primary focus-visible:after:bg-primary"
                    />
                  )}
                  <section
                    data-panel={id}
                    aria-label={p.title}
                    className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm", collapsed && "flex-none")}
                    style={collapsed ? undefined : { flex: `${weight(id)} 1 0%` }}
                  >
                    <header
                      draggable
                      onDragStart={(e) => {
                        dragging.current = id;
                        setDragOn(true);
                        e.dataTransfer.setData("text/panel", id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        dragging.current = null;
                        setDragOn(false);
                        setDropHint(null);
                      }}
                      onDragOver={(e) => {
                        allow(hint)(e);
                        e.stopPropagation();
                      }}
                      onDrop={(e) => {
                        e.stopPropagation();
                        onDrop({ column: ci, before: id })(e);
                      }}
                      className={cn(
                        "group flex h-11 shrink-0 cursor-grab items-center gap-2 px-3 active:cursor-grabbing",
                        !collapsed && "border-b border-border",
                        dropHint === hint && "shadow-[inset_0_2px_0_0_var(--primary)]",
                      )}
                    >
                      <GripVertical className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground" aria-hidden="true" />
                      <button
                        type="button"
                        id={`panel-head-${id}`}
                        onClick={() => toggleCollapse(id)}
                        aria-expanded={!collapsed}
                        className="flex min-w-0 items-center gap-1.5 rounded py-1.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {collapsed ? <ChevronRight className="size-3.5" aria-hidden="true" /> : <ChevronDown className="size-3.5" aria-hidden="true" />}
                        <span className="text-muted-foreground [&_svg]:size-4">{p.icon}</span>
                        <span className="truncate">{p.title}</span>
                      </button>
                      <div className="ml-auto flex items-center gap-0.5">
                        {p.actions}
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="size-7" aria-label={`${p.title} panel options`}>
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" data-panel={id} onCloseAutoFocus={(e) => {
                              if (!suppressReturn.current) return;
                              e.preventDefault();
                              suppressReturn.current = false;
                            }}>
                            <DropdownMenuItem onSelect={() => fromMenu(id, () => shift(id, -1))}>Move left</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => fromMenu(id, () => shift(id, 1))}>Move right</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => fromMenu(id, () => move(id, "new-column"))}>Open in its own column</DropdownMenuItem>
                            {onOpenInPeek && <DropdownMenuItem onSelect={() => { suppressReturn.current = true; onOpenInPeek(id); }}>Open in preview</DropdownMenuItem>}
                            <DropdownMenuItem onSelect={() => toggleCollapse(id)}>{collapsed ? "Expand" : "Collapse"}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => fromMenu(id, () => close(id))}>Hide panel</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* Same as Hide panel: it comes back from Layout. */}
                        <Button variant="ghost" size="icon" className="size-7" aria-label={`Close ${p.title} panel`} title="Close panel" onClick={() => announce(id, () => close(id))}>
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                    </header>
                    {!collapsed && wide && <div className="min-h-0 flex-1 overflow-y-auto">{p.render()}</div>}
                  </section>
                  </Fragment>
                );
              })}
            </div>
            {ci < layout.columns.length - 1 && !offScreen(col) && !offScreen(layout.columns[ci + 1]) && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize columns"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((col.size / (col.size + layout.columns[ci + 1].size)) * 100)}
                tabIndex={0}
                onPointerDown={(e) => rowRef.current && startResize(colPair(ci), rowRef.current.clientWidth / layout.columns.reduce((s, c) => s + c.size, 0), MIN_PX, "x", e)}
                onKeyDown={(e) => nudge(colPair(ci), 0.3, "x", e)}
                // The gap between cards is the handle; a line shows only on hover or keyboard focus.
                className="relative w-3 shrink-0 cursor-col-resize touch-none outline-none after:absolute after:inset-y-4 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors after:content-[''] hover:after:bg-primary focus-visible:after:bg-primary"
              />
            )}
          </div>
        ))}
        {/* Right edge: drop here to open a panel in a new column. */}
        <div
          onDragOver={allow("new-column")}
          onDragLeave={() => setDropHint(null)}
          onDrop={onDrop("new-column")}
          className={cn("w-3 shrink-0", dropHint === "new-column" && "w-24 bg-primary/10")}
          aria-hidden="true"
        />
        {/* While a header is dragged: drop in the top-right corner to show the panel in the side preview (layout unchanged). Only that box wins; the new-column strip below it still takes drops. */}
        {onOpenInPeek && dragOn && (
          <div
            onDragOver={allow("peek")}
            onDragLeave={() => setDropHint(null)}
            onDrop={dropInPeek}
            className={cn(
              "absolute right-3 top-3 z-30 flex h-30 w-50 items-center justify-center rounded-2xl border-2 border-dashed border-primary p-2 text-center text-xs font-medium text-primary",
              dropHint === "peek" ? "bg-primary/10" : "bg-background/80",
            )}
          >
            Open in preview
          </div>
        )}
      </div>
    </div>
  );
}
