"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  CalendarRange,
  FileSearch,
  Gauge,
  Lightbulb,
  Maximize2,
  Minimize2,
  PackageSearch,
  PackageX,
  PenLine,
  Search,
  Sparkles,
  SquarePen,
  Swords,
  Tag,
  Target,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { ASSISTANT_TOGGLE_ID, useAssistant } from "@/components/shell/assistant-state";
import { SHELL_STROKE } from "@/components/shell/icon";
import { ChatPane, type ChatSlots } from "@/components/workspace/chat-pane";
import { assistantDocks, navFor } from "@/lib/nav";
import { CHAT_PAGES, isChatPage } from "@/shared";
import { cn } from "@/lib/utils";

/** A starter card: what it says, and the fuller question it sends. */
type Suggestion = { icon: LucideIcon; title: string; hint: string; ask: string };

/**
 * Starters for the page being viewed. Only things the chat can really answer: it reads the strategy documents, the
 * SEO / AI-visibility reports, the product catalogue and the agents, and searches the web. It can't see campaigns or
 * posts, so content pages get starters that ask the person for the specifics instead of pretending to know them.
 */
const GENERAL: Suggestion[] = [
  { icon: CalendarRange, title: "Plan my next 30 days", hint: "A content and marketing plan from your strategy.", ask: "Plan my next 30 days of marketing." },
  { icon: Users, title: "Who is my customer?", hint: "Your audience, from your business documents.", ask: "Who is my customer?" },
  { icon: Swords, title: "Compare me with competitors", hint: "Where you stand and where you can win.", ask: "How do I compare with my competitors?" },
];
const BY_PAGE: Record<string, Suggestion[]> = {
  context: [
    { icon: Target, title: "Sharpen my positioning", hint: "What sets you apart, in one clear line.", ask: "Read my strategy documents and sharpen my positioning." },
    { icon: FileSearch, title: "What's missing?", hint: "Gaps and weak spots in your documents.", ask: "What's missing or weak in my strategy documents?" },
    { icon: Users, title: "Who is my customer?", hint: "Your audience, from your business documents.", ask: "Who is my customer?" },
  ],
  products: [
    { icon: PackageSearch, title: "Explore my catalogue", hint: "What you sell, by category and range.", ask: "Give me an overview of my product catalogue: what I sell, the main categories and anything that stands out." },
    { icon: Tag, title: "Analyse my pricing", hint: "Price ranges, the median and outliers.", ask: "Analyse my pricing: ranges, the median, and the products priced far above or below the rest." },
    { icon: PackageX, title: "What's out of stock?", hint: "Out of stock, and stock we can't confirm.", ask: "Which of my products are out of stock, and which have unknown stock?" },
  ],
  performance: [
    { icon: Gauge, title: "Explain my scores", hint: "Your SEO and AI-visibility reports in plain words.", ask: "Explain my latest SEO and AI-visibility reports in plain words." },
    { icon: Lightbulb, title: "What should I fix first?", hint: "The few fixes that matter most.", ask: "From my site reports, what should I fix first?" },
    { icon: Search, title: "Am I visible in AI answers?", hint: "How assistants talk about you, and why.", ask: "Am I visible when people ask AI assistants about my category?" },
  ],
  "agent-log": [
    { icon: Bot, title: "Which agents should I run?", hint: "Based on what your business needs now.", ask: "Which of my agents should I run next, and why?" },
    { icon: FileSearch, title: "What have my agents done?", hint: "Their latest runs, summed up.", ask: "Sum up what my agents did in their latest runs." },
    { icon: CalendarRange, title: "Plan my next 30 days", hint: "A content and marketing plan from your strategy.", ask: "Plan my next 30 days of marketing." },
  ],
};
for (const id of ["library", "photoshoot", "reels", "studio"])
  BY_PAGE[id] = [
    { icon: Lightbulb, title: "Content ideas for this week", hint: "Posts that fit your brand and audience.", ask: "Give me content ideas for this week." },
    { icon: PenLine, title: "Write a caption", hint: "In your brand voice; tell me the post.", ask: "Help me write a caption in my brand voice. Ask me what the post is about first." },
    { icon: CalendarRange, title: "Plan my next 30 days", hint: "A content and marketing plan from your strategy.", ask: "Plan my next 30 days of marketing." },
  ];

/** Morning / afternoon / evening, by the reader's clock (the empty state renders in the browser only). */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

const XL = "(min-width: 1280px)";
const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(XL);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};
/** Server and first paint assume the wide layout; the column is CSS-hidden below 1280 until the check runs. */
function useWide() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(XL).matches, () => true);
}

type Props = { workspaceId: string; brandId: string | null; brandName: string | null; canCreateBrand: boolean };

/**
 * The Bois & Chiffons chat: a 320 px column from 1280 px up on docked pages (assistantDocks), a right-hand drawer (opened from
 * the top bar) below that and on pages that don't dock it. One element serves both, so the conversation, a typed draft
 * and an in-flight reply survive the switch.
 * Narrow and closed, the drawer is off-screen and inert. Open, it takes focus, Escape or the scrim closes it and
 * focus goes back to the toggle. No focus trap: the page behind stays reachable, which the scrim only discourages.
 */
export function AssistantPanel(p: Props) {
  const wide = useWide();
  const pathname = usePathname();
  const docked = wide && assistantDocks(pathname);
  const { open, setOpen } = useAssistant();
  const ref = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const shown = docked || open;
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
      {docked && expanded ? <div aria-hidden="true" className="hidden w-80 shrink-0 xl:block" /> : null}
      <aside
        ref={ref}
        tabIndex={-1}
        aria-label="Bois & Chiffons"
        role={docked && !expanded ? undefined : "dialog"}
        onKeyDown={(e) => {
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
          expanded ? "w-[min(56rem,100vw)]" : "w-80",
          // Docked it sits beside the page, under the top bar (layout.tsx): the page's own 12 px edge is the gap, so no
          // left padding of its own, and its top edge lines up with the page's cards.
          docked && !expanded && "xl:static xl:z-auto xl:translate-x-0 xl:pl-0",
          open || expanded ? "translate-x-0" : "translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={cn("absolute top-7 right-6 z-10 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", docked && "xl:hidden")}
        >
          <X className="size-4" strokeWidth={SHELL_STROKE} aria-hidden="true" />
          <span className="sr-only">Close</span>
        </button>
        {/* A card like every other panel (DESIGN_SYSTEM §4): white, bordered, on the page background, not painted onto it. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <Body {...p} docked={docked} page={navFor(pathname).activeId} expanded={expanded} onExpand={() => (expanded ? collapse() : setExpanded(true))} />
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
  expanded,
  onExpand,
}: Props & { docked: boolean; page: string | null; expanded: boolean; onExpand: () => void }) {
  const title = <h2 className="text-lg leading-tight font-semibold text-foreground">Bois & Chiffons</h2>;
  const mark = (
    <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
      <Sparkles className="size-4.5" strokeWidth={SHELL_STROKE} />
    </span>
  );
  const suggestions = (page && BY_PAGE[page]) || GENERAL;

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
      <div className="flex h-16 shrink-0 items-center justify-between gap-3 px-5">
        {/* The business under the name, so the empty body has no stray line at its top. */}
        <div className="flex min-w-0 items-center gap-3">
          {mark}
          <div className="min-w-0">
            {title}
            <p className="truncate text-xs text-muted-foreground">
              Working on <span className="text-foreground">{brandName ?? "your business"}</span>
            </p>
          </div>
        </div>
        <div className={cn("mr-8 flex shrink-0 items-center gap-1", docked && "xl:mr-0")}>
          {/* From md up (a phone's drawer is already full width), and always while expanded so it can be collapsed. */}
          <button
            id={EXPAND_ID}
            type="button"
            onClick={onExpand}
            aria-pressed={expanded}
            aria-label={expanded ? "Collapse chat" : "Expand chat"}
            title={expanded ? "Collapse chat" : "Expand chat"}
            className={cn(
              "size-11 shrink-0 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px",
              expanded ? "grid" : "hidden md:grid",
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
            className="grid size-11 shrink-0 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:opacity-50 disabled:hover:bg-transparent"
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
        pageLabel={isChatPage(page) ? CHAT_PAGES[page] : null}
        wide={expanded}
        {...slots}
      />
    </div>
  );
}
