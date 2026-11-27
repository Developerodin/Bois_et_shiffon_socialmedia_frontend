"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Maximize2, Minimize2, Sparkles, SquarePen, X } from "lucide-react";
import { ASSISTANT_TOGGLE_ID, useAssistant } from "@/components/shell/assistant-state";
import { useXl } from "@/lib/media-query";
import { SHELL_STROKE } from "@/components/shell/icon";
import { ChatPane, type ChatSlots } from "@/components/workspace/chat-pane";
import { assistantDocks, navFor } from "@/lib/nav";
import { isChatPage } from "@/shared";
import { chatChannel, contextLabel, suggestionsFor } from "@/lib/assistant-context";
import { cn } from "@/lib/utils";

/** Morning / afternoon / evening, by the reader's clock (the empty state renders in the browser only). */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

/**
 * The docked column's width, for the aside and the spacer that holds its place while expanded: 320 px, 384 px from
 * 1536 px so the header fits on one line. The drawer (phone, tablet, undocked pages) is sized on its own.
 */
const COLUMN_W = "xl:w-80 2xl:w-96";
/** What Tab cycles through while the panel is an overlay. */
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = { workspaceId: string; brandId: string | null; brandName: string | null; canCreateBrand: boolean };

/**
 * The Bois & Chiffons chat: a column (COLUMN_W) from 1280 px up on docked pages (assistantDocks), a right-hand drawer (opened
 * from the top bar) below that and on pages that don't dock it: full screen on a phone, 384 px from 640 px. One element serves both, so the conversation, a typed draft
 * and an in-flight reply survive the switch.
 * Narrow and closed, the drawer is off-screen and inert. Open, it takes focus, Escape or the scrim closes it and
 * focus goes back to the toggle. As an overlay (drawer or expanded) Tab and Shift+Tab cycle inside it, so focus never
 * lands on the page behind the scrim (or, on a phone, behind the full-screen sheet).
 */
export function AssistantPanel(p: Props) {
  const wide = useXl();
  const pathname = usePathname();
  const search = useSearchParams();
  const docked = wide && assistantDocks(pathname);
  const { open, setOpen } = useAssistant();
  const ref = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const shown = docked || open;
  const page = navFor(pathname).activeId;
  // Expanded: a wide reading view over the page, for long answers and tables. Not remembered between pages.
  const [expanded, setExpanded] = useState(false);
  const collapse = useCallback(() => {
    setExpanded(false);
    requestAnimationFrame(() => document.getElementById(EXPAND_ID)?.focus());
  }, []);
  // Hidden (drawer closed, window narrowed) or another page: back to the column, so it never reopens expanded.
  useEffect(() => {
    if (shown) return;
    // Hiding makes the panel inert: move focus out first, or it falls to the page's body.
    if (ref.current?.contains(document.activeElement)) document.getElementById(ASSISTANT_TOGGLE_ID)?.focus();
    setExpanded(false);
  }, [shown]);
  useEffect(() => {
    setExpanded(false);
  }, [pathname]);

  // Going docked closes the drawer, so it doesn't reappear on its own when the window narrows again.
  useEffect(() => {
    if (docked && open) setOpen(false);
  }, [docked, open, setOpen]);

  useEffect(() => {
    ref.current?.toggleAttribute("inert", !shown);
  }, [shown]);

  // Escape collapses the wide view first, then closes the drawer, even when focus has moved to the page behind it.
  useEffect(() => {
    if (!expanded && (!open || docked)) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (expanded) collapse();
      else setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [expanded, open, docked, setOpen, collapse]);

  useEffect(() => {
    if (open && !docked) ref.current?.focus();
    else if (wasOpen.current && !open && !docked) document.getElementById(ASSISTANT_TOGGLE_ID)?.focus();
    wasOpen.current = open;
  }, [open, docked]);

  return (
    <>
      {(open && !docked) || expanded ? (
        <div aria-hidden="true" className="fixed inset-0 z-40 bg-overlay" onClick={() => (expanded ? collapse() : setOpen(false))} />
      ) : null}
      {/* Holds the docked column's place while the panel floats expanded, so the page doesn't reflow under it. */}
      {docked && expanded ? <div aria-hidden="true" className={cn("hidden shrink-0 xl:block", COLUMN_W)} /> : null}
      <aside
        ref={ref}
        tabIndex={-1}
        aria-label="Bois & Chiffons"
        role={docked && !expanded ? undefined : "dialog"}
        onKeyDown={(e) => {
          if (e.key === "Tab" && (expanded || !docked) && ref.current) {
            const items = [...ref.current.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) => el.offsetParent !== null);
            const first = items[0];
            const last = items[items.length - 1];
            const at = document.activeElement;
            if (!first || !last) return;
            if (e.shiftKey && (at === first || at === ref.current)) {
              e.preventDefault();
              last.focus();
            } else if (!e.shiftKey && at === last) {
              e.preventDefault();
              first.focus();
            }
            return;
          }
          if (e.key !== "Escape") return;
          if (expanded) {
            // Marked handled, so the document listener doesn't also close the drawer.
            e.preventDefault();
            collapse();
          } else if (!docked) {
            e.preventDefault();
            setOpen(false);
          }
        }}
        // The same element in every state (classes only), so the conversation and a streaming reply carry on.
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full shrink-0 flex-col bg-background p-3 outline-none transition-transform motion-reduce:transition-none",
          // A phone gets the whole screen (no inset, no card edge). The drawer is 384 px so its header, with touch-sized
          // buttons, fits on one line; docked, the column takes COLUMN_W.
          "max-sm:p-0",
          expanded ? "w-[min(56rem,100vw)]" : cn("w-full sm:w-96", docked && COLUMN_W),
          // Docked it sits beside the page, under the top bar (layout.tsx): the page's own 12 px edge is the gap, so no
          // left padding of its own, and its top edge lines up with the page's cards.
          docked && !expanded && "xl:static xl:z-auto xl:translate-x-0 xl:pl-0",
          open || expanded ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Floats over the header's top-right corner: the header's button row keeps mr-8 free for it (Body), so a change
            to this button's size or offset needs that margin checked too. */}
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={cn("absolute top-7 right-6 z-10 grid size-8 max-sm:top-2.5 max-sm:right-2 place-items-center rounded-lg text-muted-foreground hover:bg-muted pointer-coarse:size-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", docked && "xl:hidden")}
        >
          <X className="size-4" strokeWidth={SHELL_STROKE} aria-hidden="true" />
          <span className="sr-only">Close</span>
        </button>
        {/* A card like every other panel (DESIGN_SYSTEM §4): white, bordered, on the page background, not painted onto it. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm max-sm:rounded-none max-sm:border-0 max-sm:shadow-none">
          <Body {...p} docked={docked} page={page} channel={chatChannel(page, search)} expanded={expanded} onExpand={() => (expanded ? collapse() : setExpanded(true))} />
        </div>
      </aside>
    </>
  );
}

const EXPAND_ID = "assistant-expand";

function Body({
  workspaceId,
  brandId,
  brandName,
  canCreateBrand,
  docked,
  page,
  channel,
  expanded,
  onExpand,
}: Props & { docked: boolean; page: string | null; channel: string | null; expanded: boolean; onExpand: () => void }) {
  // One line: cut short with the full name on hover rather than wrapping the header.
  const title = (
    <h2 title="Bois & Chiffons" className="truncate text-lg leading-tight font-semibold text-foreground">
      Bois & Chiffons
    </h2>
  );
  const mark = (
    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
      <Sparkles className="size-4.5" strokeWidth={SHELL_STROKE} />
    </span>
  );
  // A channel calendar's starters follow its channel; the conversation itself is never reset by a switch.
  const suggestions = suggestionsFor(page, channel);

  if (!brandId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-16 shrink-0 items-center gap-3 px-5">
          {mark}
          {title}
        </div>
        <div className="min-h-0 flex-1 px-5 pb-5">
          <p className="text-sm text-muted-foreground">{canCreateBrand ? "Create a business to start a conversation." : "Ask a workspace admin to add a business."}</p>
        </div>
      </div>
    );
  }

  const slots: ChatSlots = {
    header: ({ busy, empty, onNew }) => (
      <div className="flex h-16 shrink-0 items-center justify-between gap-2 px-5">
        {/* The business under the name, so the empty body has no stray line at its top. */}
        <div className="flex min-w-0 items-center gap-2.5">
          {mark}
          <div className="min-w-0">
            {title}
            <p title={brandName ? `Working on ${brandName}` : undefined} className="truncate text-xs text-muted-foreground">
              Working on <span className="text-foreground">{brandName ?? "your business"}</span>
            </p>
          </div>
        </div>
        {/* mr-8 leaves room for the drawer's Close button, which floats over this corner (AssistantPanel). */}
        <div className={cn("mr-8 flex shrink-0 items-center gap-1", docked && "xl:mr-0")}>
          {/* From sm up (a phone's drawer is already full width), and always while expanded so it can be collapsed. */}
          <button
            id={EXPAND_ID}
            type="button"
            onClick={onExpand}
            aria-pressed={expanded}
            aria-label={expanded ? "Collapse chat" : "Expand chat"}
            title={expanded ? "Collapse chat" : "Expand chat"}
            className={cn(
              "size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted pointer-coarse:size-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px",
              expanded ? "grid" : "hidden sm:grid",
            )}
          >
            {expanded ? <Minimize2 className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" /> : <Maximize2 className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={onNew}
            disabled={busy || empty}
            aria-label="New conversation"
            title="New conversation"
            className="grid size-9 shrink-0 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted pointer-coarse:size-11 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:opacity-50 disabled:hover:bg-transparent"
          >
            <SquarePen className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
          </button>
        </div>
      </div>
    ),
    empty: (send) => (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <p className="font-display text-xl font-semibold text-foreground">{greeting()}</p>
          <p className="text-base text-foreground">What would you like to work on?</p>
          {/* What it can and can't do, said once: it reads, searches and offers; people decide. */}
          <p className="text-sm leading-relaxed text-muted-foreground">
            I read your strategy documents, site reports and products, search the web, and can offer to start agents. I never publish.
          </p>
        </div>
        <section aria-labelledby="chat-suggestions" className="flex flex-col gap-2">
          <h3 id="chat-suggestions" className="text-xs font-medium text-muted-foreground">
            Suggested for this page
          </h3>
          <ul className="flex flex-col gap-2">
            {suggestions.map(({ icon: Icon, title, hint, ask }) => (
              <li key={title}>
                <button
                  type="button"
                  onClick={() => send(ask)}
                  className="group flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition-colors hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
                >
                  <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-lg bg-accent text-accent-foreground">
                    <Icon className="size-4" strokeWidth={SHELL_STROKE} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-foreground">{title}</span>
                    <span className="block text-xs leading-snug text-muted-foreground">{hint}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    ),
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatPane
        key={`${workspaceId}:${brandId}`}
        workspaceId={workspaceId}
        brandId={brandId}
        page={isChatPage(page) ? page : null}
        channel={channel}
        pageLabel={contextLabel(page, channel)}
        wide={expanded}
        {...slots}
      />
    </div>
  );
}
