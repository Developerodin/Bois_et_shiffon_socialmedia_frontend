"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown, ChevronRight, GripVertical, LayoutPanelLeft, MoreHorizontal, RotateCcw } from "lucide-react";
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
const WIDE = "(min-width: 1024px)";
const subscribeWide = (cb: () => void) => {
  const m = window.matchMedia(WIDE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};
const useWide = () => useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => true);
let seq = 0;
const colId = () => `c${Date.now().toString(36)}${seq++}`;

export function sanitize<Id extends string>(raw: unknown, ids: Id[], fallback: Layout<Id>): Layout<Id> {
  const l = raw as Layout<Id> | null;
  if (!l || !Array.isArray(l.columns)) return fallback;
  const seen = new Set<Id>();
  const columns = l.columns
    .map((c) => ({ id: String(c.id ?? colId()), size: Number(c.size) > 0 ? Number(c.size) : 1, panels: (c.panels ?? []).filter((p) => ids.includes(p) && !seen.has(p) && seen.add(p)) }))
    .filter((c) => c.panels.length);
  return columns.length ? { columns, collapsed: (l.collapsed ?? []).filter((p) => ids.includes(p)) } : fallback;
}

export function PanelLayout<Id extends string>({
  panels,
  presets,
  storageKey,
  focus,
}: {
  panels: PanelDef<Id>[];
  presets: Preset<Id>[];
  storageKey: string;
  /** Bring this panel into view (re-shown if hidden, selected on phones); change `n` to re-trigger. */
  focus?: { id: Id; n: number };
}) {
  const ids = panels.map((p) => p.id);
  const [layout, setLayout] = useState<Layout<Id>>(presets[0].layout);
  const wide = useWide();
  const [mobilePanel, setMobilePanel] = useState<Id | null>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  const [hintSeen, setHintSeen] = useState(true);
  const dragging = useRef<Id | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

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
  const shift = (id: Id, dir: -1 | 1) => {
    const from = columnOf(id);
    const to = from + dir;
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
    if (id && ids.includes(id)) move(id, target);
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
    setLayout((l) => {
      const shown = l.columns.some((c) => c.panels.includes(focus.id));
      const open = { ...l, collapsed: l.collapsed.filter((p) => p !== focus.id) };
      if (shown) return open;
      const columns = open.columns.length ? open.columns.map((c, i) => (i === Math.min(1, open.columns.length - 1) ? { ...c, panels: [focus.id, ...c.panels] } : c)) : [{ id: colId(), size: 1, panels: [focus.id] }];
      return { ...open, columns };
    });
  }, [focus]);

  const def = (id: Id) => panels.find((p) => p.id === id)!;
  // Phones show one panel at a time, so every panel gets a tab; the layout only arranges desktop.
  const activeMobile = mobilePanel ?? (visible.find((v) => v !== "context" as Id) ?? ids[0]);

  const layoutMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
          <LayoutPanelLeft aria-hidden="true" /> Layout
        </Button>
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
        {panels.map((p) => (
          <DropdownMenuCheckboxItem key={p.id} checked={visible.includes(p.id)} onCheckedChange={(on) => (on ? show(p.id) : hide(p.id))} onSelect={(e) => e.preventDefault()}>
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
      <div className="hidden h-9 shrink-0 items-center justify-between gap-2 border-b border-border px-3 lg:flex">
        {!hintSeen && (
          <p className="hidden items-center gap-2 text-xs text-muted-foreground lg:flex">
            Drag a panel by its header to move it. Drag the dividers to resize.
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
        <div className="ml-auto">{layoutMenu}</div>
      </div>

      {/* Phones and small tablets: one panel at a time with tabs (Okara pattern). */}
      <div className="flex min-h-0 flex-1 flex-col lg:hidden">
        <div className="min-h-0 flex-1 overflow-y-auto">{!wide && activeMobile && def(activeMobile).render()}</div>
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

      <div ref={rowRef} className="hidden min-h-0 flex-1 lg:flex">
        {layout.columns.map((col, ci) => (
          <div key={col.id} className="flex min-h-0 min-w-0" style={{ flex: `${col.size} 1 0%` }}>
            <div
              className={cn("flex min-h-0 min-w-0 flex-1 flex-col", dropHint === `col-${ci}` && "bg-primary/5")}
              onDragOver={allow(`col-${ci}`)}
              onDragLeave={() => setDropHint(null)}
              onDrop={onDrop({ column: ci })}
            >
              {col.panels.map((id) => {
                const p = def(id);
                const collapsed = layout.collapsed.includes(id);
                const hint = `before-${id}`;
                return (
                  <section
                    key={id}
                    aria-label={p.title}
                    className={cn("flex min-h-0 flex-col border-b border-border last:border-b-0", collapsed ? "flex-none" : "flex-1")}
                  >
                    <header
                      draggable
                      onDragStart={(e) => {
                        dragging.current = id;
                        e.dataTransfer.setData("text/panel", id);
                        e.dataTransfer.effectAllowed = "move";
                      }}
                      onDragEnd={() => {
                        dragging.current = null;
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
                        "group flex h-10 shrink-0 cursor-grab items-center gap-2 border-b border-border px-2 active:cursor-grabbing",
                        dropHint === hint && "shadow-[inset_0_2px_0_0_var(--primary)]",
                      )}
                    >
                      <GripVertical className="size-4 text-muted-foreground/50 group-hover:text-muted-foreground" aria-hidden="true" />
                      <button
                        type="button"
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
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onSelect={() => shift(id, -1)}>Move left</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => shift(id, 1)}>Move right</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => move(id, "new-column")}>Open in its own column</DropdownMenuItem>
                            <DropdownMenuItem onSelect={() => toggleCollapse(id)}>{collapsed ? "Expand" : "Collapse"}</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onSelect={() => hide(id)}>Hide panel</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </header>
                    {!collapsed && wide && <div className="min-h-0 flex-1 overflow-y-auto">{p.render()}</div>}
                  </section>
                );
              })}
            </div>
            {ci < layout.columns.length - 1 && (
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
                className="relative w-px shrink-0 cursor-col-resize before:absolute before:inset-y-0 before:-inset-x-1 before:z-10 before:content-[''] bg-border outline-none transition-colors hover:bg-primary focus-visible:bg-primary [box-shadow:0_0_0_3px_transparent] hover:[box-shadow:0_0_0_2px_color-mix(in_srgb,var(--primary)_30%,transparent)]"
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
      </div>
    </div>
  );
}
