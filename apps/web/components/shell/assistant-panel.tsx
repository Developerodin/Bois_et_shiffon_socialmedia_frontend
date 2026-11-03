"use client";

import { useSyncExternalStore } from "react";
import { MessageCircle, SquarePen } from "lucide-react";
import { useAssistant } from "@/components/shell/assistant-state";
import { SHELL_STROKE } from "@/components/shell/icon";
import { ChatPane, type ChatSlots } from "@/components/workspace/chat-pane";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

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

type Props = { workspaceId: string; brandId: string | null; brandName: string | null };

/** The Espanda chat: a 320 px column from 1280 px up, a right-hand sheet (opened from the top bar) below. */
export function AssistantPanel(p: Props) {
  const wide = useWide();
  const { open, setOpen } = useAssistant();
  // One mounted conversation at a time: the column and the sheet never both run the same thread.
  if (wide) {
    return (
      <aside aria-label="Espanda" className="hidden h-full w-80 shrink-0 flex-col xl:flex">
        <Body {...p} inSheet={false} />
      </aside>
    );
  }
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-80 flex-col gap-0 p-0 sm:max-w-80">
        <Body {...p} inSheet />
      </SheetContent>
    </Sheet>
  );
}

function Body({ workspaceId, brandId, brandName, inSheet }: Props & { inSheet: boolean }) {
  const Title = inSheet ? SheetTitle : "h2";
  const title = <Title className="text-xl/[26px] font-semibold text-foreground">Espanda</Title>;
  const subtitle = <p className="text-sm text-muted-foreground">Your team, one conversation</p>;

  if (!brandId) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-30 shrink-0 flex-col justify-center gap-0.5 border-b border-border bg-card px-6">
          {title}
          {subtitle}
        </div>
        <div className="min-h-0 flex-1 bg-background p-6">
          <p className="text-sm text-muted-foreground">Create a business to start a conversation.</p>
        </div>
      </div>
    );
  }

  const slots: ChatSlots = {
    variant: "panel",
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
          className={`grid size-11 shrink-0 place-items-center rounded-2xl text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px disabled:opacity-50 disabled:hover:bg-transparent ${inSheet ? "mr-8" : ""}`}
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
      <ChatPane key={`${workspaceId}:${brandId}`} workspaceId={workspaceId} brandId={brandId} website={null} {...slots} />
    </div>
  );
}
