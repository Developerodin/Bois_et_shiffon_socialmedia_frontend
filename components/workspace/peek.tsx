"use client";

import { createContext, useContext, useEffect, useId, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import { SHELL_STROKE } from "@/components/shell/icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { arrow, drag, KEY_STEP } from "@/components/workspace/resize";
import { PEEK_WIDTH, usePeekWidth } from "@/components/workspace/use-peek";

type Props = {
  /** False while sliding out: the snapshot still shows, the board behind is no longer dimmed. */
  open: boolean;
  title: string;
  crumb: string;
  onClose: () => void;
  /** The slide out has ended: the caller unmounts the peek. */
  onExited: () => void;
  /** A page of its own for the item (studio reels); the others have none. */
  fullPageHref?: string;
  asideRef: RefObject<HTMLElement | null>;
  /**
   * "board" (default): over the right of the Overview's own wrapper. "page": fixed to the window's right edge below the
   * top bar (h-18, so its menus stay reachable), for a page that scrolls in the shell's main area (/tasks), where an
   * absolute peek would scroll away with the page.
   */
  placement?: "board" | "page";
  /** A fixed width (px) on wide screens instead of the draggable one (the calendar's post inspector). */
  fixedWidth?: number;
  children: ReactNode;
};

/** The peek's header line under the title and its action footer, for the view inside to fill (PeekSlot). */
const SlotsContext = createContext<{ header: HTMLElement | null; footer: HTMLElement | null; setTitle: (t: string | null) => void }>({ header: null, footer: null, setTitle: () => {} });

/**
 * Puts its children in the peek's sticky header (under the title) or its sticky footer, so they stay in view while the
 * body scrolls; React state and events stay with the view that renders them. Outside a peek they render in place.
 */
export function PeekSlot({ to, children }: { to: "header" | "footer"; children: ReactNode }) {
  const el = useContext(SlotsContext)[to];
  return el ? createPortal(children, el) : <>{children}</>;
}

/** Names the peek after what the view inside loaded (a post opened by link, before its list is cached). */
export function usePeekTitle(title: string | undefined) {
  const { setTitle } = useContext(SlotsContext);
  useEffect(() => {
    if (!title) return;
    setTitle(title);
    return () => setTitle(null);
  }, [title, setTitle]);
}

// ponytail: not Sheet. Sheet is a modal Radix dialog fixed to the viewport (focus trap, scrim that eats clicks); the peek
// sits inside the Overview, next to the assistant, and leaves the board usable behind it.
/** A side peek over the right of the Overview (the open post, document, agent, competitor or task), or of a tasks page. */
export function Peek({ open, title, crumb, onClose, onExited, fullPageHref, asideRef, placement = "board", fixedWidth, children }: Props) {
  const titleId = useId();
  // Mounted off-screen, then slid in: the style is read first so the browser has a start for the transition.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    asideRef.current?.getBoundingClientRect();
    const f = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(f);
  }, [asideRef]);
  const shown = open && entered;
  const { width: dragged, max, resize } = usePeekWidth();
  const width = fixedWidth ?? dragged;
  const [header, setHeader] = useState<HTMLElement | null>(null);
  const [footer, setFooter] = useState<HTMLElement | null>(null);
  const [loadedTitle, setTitle] = useState<string | null>(null);
  // The scrim and the sheet share the placement; the top bar is sticky z-30, so a page peek sits under its menus.
  const page = placement === "page";
  return (
    <>
      <div aria-hidden="true" className={cn("pointer-events-none bg-foreground/5 transition-opacity duration-200 motion-reduce:transition-none", page ? "fixed inset-x-0 bottom-0 top-18 z-20" : "absolute inset-0 z-20", shown ? "opacity-100" : "opacity-0")} />
      <aside
        ref={asideRef}
        role="region"
        aria-labelledby={titleId}
        // Esc closes the peek only when nothing inside used it first (a menu, the story zoom), and is then used up so
        // the assistant's own Esc listener on the document doesn't also act.
        onKeyDown={(e) => {
          if (e.key !== "Escape" || e.defaultPrevented) return;
          e.preventDefault();
          onClose();
        }}
        onTransitionEnd={(e) => {
          if (e.target === e.currentTarget && (e.propertyName === "transform" || e.propertyName === "translate") && !open) onExited();
        }}
        // The width is set by style, so a drag never jumps; only the slide (transform) is transitioned.
        style={{ "--peek-w": `${width}px` } as CSSProperties}
        className={cn(
          "right-0 flex w-full flex-col border-l border-border bg-background shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none lg:w-[min(var(--peek-w),75vw,100%)]",
          page ? "fixed bottom-0 top-18 z-20" : "absolute inset-y-0 z-20",
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Wide screens: drag the left edge or use the arrow keys to resize; double-click for the default width. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize preview"
          aria-valuemin={Math.min(400, max)}
          aria-valuemax={max}
          aria-valuenow={width}
          tabIndex={0}
          onPointerDown={(e) => {
            const start = width;
            let last = start;
            drag(e, "x", (px) => resize((last = start - px), false), () => resize(last));
          }}
          onKeyDown={(e) => {
            const dir = arrow(e.key, "x");
            if (!dir) return;
            e.preventDefault();
            resize(width - dir * Math.round(width * KEY_STEP));
          }}
          onDoubleClick={() => resize(PEEK_WIDTH)}
          className={cn(
            "absolute inset-y-0 left-0 z-20 w-3 -translate-x-1/2 cursor-col-resize touch-none outline-none after:absolute after:inset-y-4 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors after:content-[''] hover:after:bg-primary focus-visible:after:bg-primary",
            fixedWidth ? "hidden" : "hidden lg:block",
          )}
        />
        {/* The header and the footer stay put; only the body between them scrolls. */}
        <div className="flex shrink-0 items-start gap-3 border-b border-border bg-background px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{crumb}</p>
            <p id={titleId} data-peek-title tabIndex={-1} className="line-clamp-2 text-sm font-semibold focus:outline-none">
              {loadedTitle ?? title}
            </p>
            <div ref={setHeader} className="mt-1.5 empty:hidden" />
          </div>
          {fullPageHref && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={fullPageHref}>Open full page</Link>
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-sm pointer-coarse:size-11 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" strokeWidth={SHELL_STROKE} aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        <SlotsContext.Provider value={{ header, footer, setTitle }}>
          <div data-peek-body className="flex min-h-0 flex-1 flex-col overflow-y-auto">{children}</div>
        </SlotsContext.Provider>
        <div ref={setFooter} data-peek-footer className="shrink-0 border-t border-border bg-background px-4 py-3 empty:hidden" />
      </aside>
    </>
  );
}
