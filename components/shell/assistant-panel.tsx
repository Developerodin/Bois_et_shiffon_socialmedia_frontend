"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { ArrowRight, SquarePen, X } from "lucide-react";
import { ASSISTANT_TOGGLE_ID, useAssistant } from "@/components/shell/assistant-state";
import { SHELL_STROKE } from "@/components/shell/icon";
import { ChatPane, type ChatSlots } from "@/components/workspace/chat-pane";
import { assistantDocks } from "@/lib/nav";
import { cn } from "@/lib/utils";

const SUGGESTIONS = ["Plan my next 30 days", "Who is my customer?", "How do I compare with my competitors?"];

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
          "fixed inset-y-0 right-0 z-50 flex h-full w-80 shrink-0 flex-col border-l border-border bg-background outline-none transition-transform motion-reduce:transition-none",
          docked && "xl:static xl:z-auto xl:translate-x-0 xl:border-l-0",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <button
          type="button"
          onClick={() => setOpen(false)}
          className={cn("absolute top-5 right-4 z-10 grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", docked && "xl:hidden")}
        >
          <X className="size-4" strokeWidth={SHELL_STROKE} aria-hidden="true" />
          <span className="sr-only">Close</span>
        </button>
        <Body {...p} docked={docked} />
      </aside>
    </>
  );
}

function Body({ workspaceId, brandId, brandName, canCreateBrand, docked }: Props & { docked: boolean }) {
  // The same 72 px as the top bar, so the panel and the page share a horizon.
  const title = <h2 className="text-lg font-semibold text-foreground">Espanda</h2>;

  if (!brandId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-18 shrink-0 items-center border-b border-border bg-card px-6">{title}</div>
        <div className="min-h-0 flex-1 bg-background p-6">
          <p className="text-sm text-muted-foreground">{canCreateBrand ? "Create a business to start a conversation." : "Ask a workspace admin to add a business."}</p>
        </div>
      </div>
    );
  }

  const slots: ChatSlots = {
    header: ({ busy, empty, onNew }) => (
      <div className="flex h-18 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-6">
        {/* The business under the name, so the empty body has no stray line at its top. */}
        <div className="min-w-0">
          {title}
          <p className="truncate text-xs text-muted-foreground">
            Working on <span className="text-foreground">{brandName ?? "your business"}</span>
          </p>
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
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Ask about your business, your drafts or what to do next. Espanda reads your documents and reports and can offer to start agents; it never publishes.
        </p>
        <ul className="flex flex-col gap-2">
          {SUGGESTIONS.map((s) => (
            <li key={s}>
              <button
                type="button"
                onClick={() => send(s)}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl bg-card px-4 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px"
              >
                {s}
                <ArrowRight className="size-4 shrink-0 text-muted-foreground" strokeWidth={SHELL_STROKE} aria-hidden="true" />
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
