"use client";

import { useEffect, useId, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
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
  children: ReactNode;
};

// ponytail: not Sheet. Sheet is a modal Radix dialog fixed to the viewport (focus trap, scrim that eats clicks); the peek
// sits inside the Overview, next to the assistant, and leaves the board usable behind it.
/** A side peek over the right of the Overview: the open post, document, agent or competitor. */
export function Peek({ open, title, crumb, onClose, onExited, fullPageHref, asideRef, children }: Props) {
  const titleId = useId();
  // Mounted off-screen, then slid in: the style is read first so the browser has a start for the transition.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    asideRef.current?.getBoundingClientRect();
    const f = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(f);
  }, [asideRef]);
  const shown = open && entered;
  const [width, resize] = usePeekWidth();
  return (
    <>
      <div aria-hidden="true" className={cn("pointer-events-none absolute inset-0 z-20 bg-foreground/5 transition-opacity duration-200 motion-reduce:transition-none", shown ? "opacity-100" : "opacity-0")} />
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
          "absolute inset-y-0 right-0 z-20 flex w-full flex-col border-l border-border bg-background shadow-xl transition-transform duration-200 ease-out motion-reduce:transition-none lg:w-[min(var(--peek-w),100%)]",
          shown ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Wide screens: drag the left edge or use the arrow keys to resize; double-click for the default width. */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize preview"
          aria-valuemin={400}
          aria-valuemax={1000}
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
          className="absolute inset-y-0 left-0 z-20 hidden w-3 -translate-x-1/2 cursor-col-resize outline-none after:absolute after:inset-y-4 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:rounded-full after:bg-transparent after:transition-colors after:content-[''] hover:after:bg-primary focus-visible:after:bg-primary lg:block"
        />
        {/* The scroller is inside the sheet, so the edge handle stays put while the content scrolls. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-border bg-background px-5 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs text-muted-foreground">{crumb}</p>
            <h2 id={titleId} data-peek-title tabIndex={-1} className="truncate text-sm font-semibold focus:outline-none">
              {title}
            </h2>
          </div>
          {fullPageHref && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={fullPageHref}>Open full page</Link>
            </Button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="flex size-8 shrink-0 items-center justify-center rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
          >
            <X className="h-4 w-4" strokeWidth={SHELL_STROKE} aria-hidden="true" />
            <span className="sr-only">Close</span>
          </button>
        </div>
        {children}
        </div>
      </aside>
    </>
  );
}
