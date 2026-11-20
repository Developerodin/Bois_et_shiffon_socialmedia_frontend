"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
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
import { cn } from "@/lib/utils";

/**
 * VS Code-style free layout: columns of stacked panels. Drag a panel by its header to another
 * column, onto another panel (inserts before it) or to the right edge (new column); drag the
 * dividers to resize; every move also has a keyboard path in the panel's menu.
 * ponytail: columns resize horizontally only; stacked panels share a column's height equally
 * (or collapse to their header). Add vertical splitters if people ask for them.
 */
export type PanelDef<Id extends string> = { id: Id; title: string; icon: ReactNode; render: () => ReactNode; actions?: ReactNode };
type Column<Id extends string> = { id: string; size: number; panels: Id[] };
export type Layout<Id extends string> = { columns: Column<Id>[]; collapsed: Id[] };
export type Preset<Id extends string> = { name: string; description: string; layout: Layout<Id> };

const MIN_PX = 240;
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
  return columns.length ? { columns, collapsed: (l.collapsed ?? []).filter((p) => ids.includes(p)) } : fallback;
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
  const remove = (l: Layout<Id>, id: Id): Layout<Id> => ({ ...l, columns: l.columns.map((c) => ({ ...c, panels: c.panels.filter((p) => p !== id) })) });

  const move = (id: Id, target: { column: number; before?: Id } | "new-column", fromLayout = layout) => {
    const l = remove(fromLayout, id);
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
  const hide = (id: Id) => commit({ ...remove(layout, id), collapsed: layout.collapsed.filter((p) => p !== id) });
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

  // Divider drag: move size between the two neighbouring columns.
  const startResize = (index: number, e: React.PointerEvent) => {
    const row = rowRef.current;
    if (!row) return;
    e.preventDefault();
    const total = layout.columns.reduce((s, c) => s + c.size, 0);
    const pxPerUnit = row.clientWidth / total;
    const a = layout.columns[index];
    const b = layout.columns[index + 1];
    const startX = e.clientX;
    const min = MIN_PX / pxPerUnit;
    const onMove = (ev: PointerEvent) => {
      const delta = (ev.clientX - startX) / pxPerUnit;
      const na = Math.max(min, Math.min(a.size + b.size - min, a.size + delta));
      setLayout((l) => ({ ...l, columns: l.columns.map((c, i) => (i === index ? { ...c, size: na } : i === index + 1 ? { ...c, size: a.size + b.size - na } : c)) }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setLayout((l) => {
        try {
          localStorage.setItem(storageKey, JSON.stringify(l));
        } catch {
          // ignore
        }
        return l;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };
  const nudge = (index: number, e: React.KeyboardEvent) => {
    const step = e.key === "ArrowLeft" ? -0.08 : e.key === "ArrowRight" ? 0.08 : 0;
    if (!step) return;
    e.preventDefault();
    const a = layout.columns[index];
    const b = layout.columns[index + 1];
    const na = Math.max(0.3, Math.min(a.size + b.size - 0.3, a.size + step * (a.size + b.size)));
    commit({ ...layout, columns: layout.columns.map((c, i) => (i === index ? { ...c, size: na } : i === index + 1 ? { ...c, size: a.size + b.size - na } : c)) });
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
              {col.panels.filter((id) => id !== previewing).map((id) => {
                const p = def(id);
                const collapsed = layout.collapsed.includes(id);
                const hint = `before-${id}`;
                return (
                  <section
                    key={id}
                    data-panel={id}
                    aria-label={p.title}
                    className={cn("flex min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm", collapsed ? "flex-none" : "flex-1")}
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
                            <DropdownMenuItem onSelect={() => fromMenu(id, () => hide(id))}>Hide panel</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        {/* Same as Hide panel: it comes back from Layout. */}
                        <Button variant="ghost" size="icon" className="size-7" aria-label={`Close ${p.title} panel`} title="Close panel" onClick={() => announce(id, () => hide(id))}>
                          <X aria-hidden="true" />
                        </Button>
                      </div>
                    </header>
                    {!collapsed && wide && <div className="min-h-0 flex-1 overflow-y-auto">{p.render()}</div>}
                  </section>
                );
              })}
            </div>
            {ci < layout.columns.length - 1 && !offScreen(layout.columns[ci + 1]) && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize columns"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round((col.size / (col.size + layout.columns[ci + 1].size)) * 100)}
                tabIndex={0}
                onPointerDown={(e) => startResize(ci, e)}
                onKeyDown={(e) => nudge(ci, e)}
                // The gap between cards is the handle; a line shows only on hover or keyboard focus.
                className="relative w-3 shrink-0 cursor-col-resize outline-none after:absolute after:inset-y-4 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors after:content-[''] hover:after:bg-primary focus-visible:after:bg-primary"
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
