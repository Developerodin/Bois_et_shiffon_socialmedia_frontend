"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { MessageCircle, SquarePen, X } from "lucide-react";
import { ASSISTANT_TOGGLE_ID, useAssistant } from "@/components/shell/assistant-state";
import { SHELL_STROKE } from "@/components/shell/icon";
import { ChatPane, type ChatSlots } from "@/components/workspace/chat-pane";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["What should I focus on this week?", "Summarise what my agents did recently."];

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
 * The Espanda chat: a 320 px column from 1280 px up, a right-hand drawer (opened from the top bar) below.
 * One element serves both, so the conversation, a typed draft and an in-flight reply survive crossing 1280 px.
 * Narrow and closed, the drawer is off-screen and inert. Open, it takes focus, Escape or the scrim closes it and
 * focus goes back to the toggle. No focus trap: the page behind stays reachable, which the scrim only discourages.
 */
export function AssistantPanel(p: Props) {
  const wide = useWide();
  const { open, setOpen } = useAssistant();
  const ref = useRef<HTMLElement>(null);
  const wasOpen = useRef(false);
  const shown = wide || open;

  // Going wide closes the drawer, so it doesn't reappear on its own when the window narrows again.
  useEffect(() => {
    if (wide && open) setOpen(false);
  }, [wide, open, setOpen]);

  useEffect(() => {
    ref.current?.toggleAttribute("inert", !shown);
  }, [shown]);

  // Escape closes the drawer even when focus has moved to the page behind it.
  useEffect(() => {
    if (!open || wide) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, wide, setOpen]);

  useEffect(() => {
    if (open && !wide) ref.current?.focus();
    else if (wasOpen.current && !open && !wide) document.getElementById(ASSISTANT_TOGGLE_ID)?.focus();
    wasOpen.current = open;
  }, [open, wide]);

  return (
    <>
      {open && !wide ? (
        <div aria-hidden="true" className="fixed inset-0 z-40 bg-black/50 xl:hidden" onClick={() => setOpen(false)} />
      ) : null}
      <aside
        ref={ref}
        tabIndex={-1}
        aria-label="Espanda"
        role={wide ? undefined : "dialog"}
        onKeyDown={(e) => {
          if (e.key === "Escape" && !wide) setOpen(false);
        }}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex h-full w-80 shrink-0 flex-col border-l border-border bg-background outline-none transition-transform motion-reduce:transition-none",
          "xl:static xl:z-auto xl:translate-x-0 xl:border-l-0",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="absolute top-4 right-4 z-10 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring xl:hidden"
        >
          <X className="size-4" strokeWidth={SHELL_STROKE} aria-hidden="true" />
          <span className="sr-only">Close</span>
        </button>
        <Body {...p} />
      </aside>
    </>
  );
}

function Body({ workspaceId, brandId, brandName, canCreateBrand }: Props) {
  const title = <h2 className="text-xl/[26px] font-semibold text-foreground">Espanda</h2>;
  const subtitle = <p className="text-sm text-muted-foreground">Your team, one conversation</p>;

  if (!brandId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-30 shrink-0 flex-col justify-center gap-0.5 border-b border-border bg-card px-6">
          {title}
          {subtitle}
        </div>
        <div className="min-h-0 flex-1 bg-background p-6">
          <p className="text-sm text-muted-foreground">{canCreateBrand ? "Create a business to start a conversation." : "Ask a workspace admin to add a business."}</p>
        </div>
      </div>
    );
  }

  const slots: ChatSlots = {
    header: ({ busy, empty, onNew }) => (
      <div className="flex h-30 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-6">
        <div className="flex min-w-0 flex-col gap-0.5">
          {title}
          {subtitle}
        </div>
        <button
          type="button"
          onClick={onNew}
          disabled={busy || empty}
          aria-label="New conversation"
          title="New conversation"
          className={`grid size-11 shrink-0 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:opacity-50 disabled:hover:bg-transparent mr-8 xl:mr-0`}
        >
          <SquarePen className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
        </button>
      </div>
    ),
    intro: (
      <div className="flex shrink-0 flex-col gap-3">
        <div className="w-full rounded-2xl bg-accent px-4 py-3">
          <p className="text-xs/[18px] text-muted-foreground">Business context</p>
          <p className="truncate text-sm text-foreground">{brandName ?? "Your business"}</p>
        </div>
        <p className="text-xs/[18px] text-muted-foreground">Espanda reads your documents and reports, and can offer to start agents. It never publishes.</p>
      </div>
    ),
    empty: (send) => (
      <div className="flex flex-col gap-4">
        <span className="grid size-9 place-items-center rounded-xl bg-card text-primary-strong" aria-hidden="true">
          <MessageCircle className="size-5" strokeWidth={SHELL_STROKE} />
        </span>
        <div>
          <p className="text-sm font-semibold text-foreground">Espanda</p>
          <p className="text-sm text-muted-foreground">Ask about your business, your drafts or what to do next.</p>
        </div>
        <p className="text-xs/[18px] text-muted-foreground">A good place to start</p>
        <ul className="flex flex-col gap-3">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => send(s)}
                className="flex h-12 w-full items-center rounded-2xl bg-card px-4 text-left text-sm text-primary-strong transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      </div>
    ),
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ChatPane key={`${workspaceId}:${brandId}`} workspaceId={workspaceId} brandId={brandId} {...slots} />
    </div>
  );
}
