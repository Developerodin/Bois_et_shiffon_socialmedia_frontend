"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  Bot,
  CalendarRange,
  FileSearch,
  Gauge,
  Lightbulb,
  Megaphone,
  PenLine,
  Search,
  Sparkles,
  SquarePen,
  Swords,
  Target,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { ASSISTANT_TOGGLE_ID, useAssistant } from "@/components/shell/assistant-state";
import { SHELL_STROKE } from "@/components/shell/icon";
import { ChatPane, type ChatSlots } from "@/components/workspace/chat-pane";
import { assistantDocks, navFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

/** A starter card: what it says, and the fuller question it sends. */
type Suggestion = { icon: LucideIcon; title: string; hint: string; ask: string };

/**
 * Starters for the page being viewed. Only things the chat can really answer: it reads the strategy documents, the
 * SEO / AI-visibility reports and the agents, and searches the web. It can't see products, prices or campaigns, so
 * those pages get starters that ask the person for the specifics instead of pretending to know them.
 * ponytail: keyed by nav id; give the chat a products tool before offering catalogue analysis here.
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
    { icon: Megaphone, title: "Promote a product", hint: "Post ideas and angles for one product.", ask: "Give me ideas to promote one of my products. Ask me which product first." },
    { icon: PenLine, title: "Write a product description", hint: "In your brand voice; paste the details.", ask: "Help me write a product description in my brand voice. Ask me for the product details first." },
    { icon: CalendarRange, title: "Plan a product launch", hint: "A short launch plan across your channels.", ask: "Plan a launch for a new product. Ask me about the product first." },
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
 * The Espanda chat: a 320 px column from 1280 px up on docked pages (assistantDocks), a right-hand drawer (opened from
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

  // Going docked closes the drawer, so it doesn't reappear on its own when the window narrows again.
  useEffect(() => {
    if (docked && open) setOpen(false);
  }, [docked, open, setOpen]);

  useEffect(() => {
    ref.current?.toggleAttribute("inert", !shown);
  }, [shown]);

  // Escape closes the drawer even when focus has moved to the page behind it.
  useEffect(() => {
    if (!open || docked) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, docked, setOpen]);

  useEffect(() => {
    if (open && !docked) ref.current?.focus();
    else if (wasOpen.current && !open && !docked) document.getElementById(ASSISTANT_TOGGLE_ID)?.focus();
    wasOpen.current = open;
  }, [open, docked]);

  return (
    <>
      {open && !docked ? (
        <div aria-hidden="true" className="fixed inset-0 z-40 bg-overlay" onClick={() => setOpen(false)} />
      ) : null}
      <aside
        ref={ref}
        tabIndex={-1}
        aria-label="Espanda"
        role={docked ? undefined : "dialog"}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !docked) setOpen(false);
        }}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-80 shrink-0 flex-col bg-background p-3 outline-none transition-transform motion-reduce:transition-none",
          // Docked it sits beside the page: the page's own 12 px edge is the gap, so no left padding of its own, and it
          // starts under the 72 px top bar (+12 px) so its top edge lines up with the page's cards, not the bar.
          docked && "xl:static xl:z-auto xl:translate-x-0 xl:pt-21 xl:pl-0",
          open ? "translate-x-0" : "translate-x-full",
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
          <Body {...p} docked={docked} page={navFor(pathname).activeId} />
        </div>
      </aside>
    </>
  );
}

function Body({ workspaceId, brandId, brandName, canCreateBrand, docked, page }: Props & { docked: boolean; page: string | null }) {
  const title = <h2 className="text-lg leading-tight font-semibold text-foreground">Espanda</h2>;
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
        <button
          type="button"
          onClick={onNew}
          disabled={busy || empty}
          aria-label="New conversation"
          title="New conversation"
          className={cn("grid size-11 shrink-0 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:opacity-50 disabled:hover:bg-transparent mr-8", docked && "xl:mr-0")}
        >
          <SquarePen className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
        </button>
      </div>
    ),
    empty: (send) => (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <p className="font-display text-xl font-semibold text-foreground">{greeting()}</p>
          <p className="text-base text-foreground">What would you like to work on?</p>
          {/* What it can and can't do, said once: it reads, searches and offers; people decide. */}
          <p className="text-sm leading-relaxed text-muted-foreground">
            I read your strategy documents and site reports, search the web, and can offer to start agents. I never publish.
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
      <ChatPane key={`${workspaceId}:${brandId}`} workspaceId={workspaceId} brandId={brandId} {...slots} />
    </div>
  );
}
