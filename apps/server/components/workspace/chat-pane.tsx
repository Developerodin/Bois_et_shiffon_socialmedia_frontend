"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { SHELL_STROKE } from "@/components/shell/icon";
import { Check, Globe, Loader2, Play, Square, TriangleAlert, Wrench } from "lucide-react";
import { startRun } from "@/components/agents/api";
import { isOffline, NET_MESSAGE, send } from "@/lib/net";
import { Markdown } from "@/components/context/markdown";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TOOL_LABEL: Record<string, (input: Record<string, unknown> | undefined) => string> = {
  listDocuments: () => "Checked your strategy documents",
  readDocument: (i) => `Read ${String(i?.kind ?? "a document").replace(/-/g, " ")}`,
  getSiteReports: () => "Read the SEO and AI-visibility reports",
  listAgents: () => "Checked the agents",
  startAgent: (i) => `Offered to start the ${String(i?.agentKey ?? "")} agent`,
  webSearch: () => "Searched the web",
};

type Props = { workspaceId: string; brandId: string };

type Thread = { id: string; messages: UIMessage[] };

/** What the host supplies: the header, the intro above the conversation and the empty state. */
export type ChatSlots = {
  header: (s: { busy: boolean; empty: boolean; onNew: () => void }) => ReactNode;
  /** Rendered at the top of the scrolling body, above the conversation. */
  intro: ReactNode;
  empty: (send: (text: string) => void) => ReactNode;
};

/** The AI SDK uses a failed response's body as the error message: show the problem+json detail, not the JSON. */
function chatError(error: Error) {
  // No response at all (fetch's TypeError): say why, and keep the retry. The message stays in the thread.
  if (isOffline())
    return {
      text: "You’re offline, so that message wasn’t sent. Press Try again once you’re back.",
      retry: true,
    };
  if (error.name === "TypeError")
    return {
      text: `${NET_MESSAGE.unreachable} Your message wasn't sent.`,
      retry: true,
    };
  try {
    const p = JSON.parse(error.message) as {
      detail?: string;
      title?: string;
      status?: number;
    };
    return {
      text: p.detail || p.title || "Something went wrong.",
      retry: !(p.status && p.status >= 400 && p.status < 500),
    };
  } catch {
    return { text: error.message || "Something went wrong.", retry: true };
  }
}

/** Loads the person's latest conversation for this brand, then hands over to the live session. */
export function ChatPane({ header, intro, empty, ...props }: Props & ChatSlots) {
  // The thread remembers which business it was loaded for, so a switch can never show or send into the old one,
  // not even for a render while the new fetch is slow or failing.
  const [loaded, setLoaded] = useState<{ base: string; thread: Thread } | null>(null);
  const base = `/api/v1/workspaces/${encodeURIComponent(props.workspaceId)}/brands/${encodeURIComponent(props.brandId)}/chat`;
  useEffect(() => {
    let cancelled = false;
    // Offline: wait for the connection rather than open an empty chat and start a second conversation.
    send(base, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : { thread: null }))
      .then(
        (d: { thread: Thread | null }) =>
          !cancelled &&
          setLoaded({
            base,
            thread: d.thread ?? { id: crypto.randomUUID(), messages: [] },
          }),
      )
      .catch(
        () =>
          !cancelled &&
          setLoaded({
            base,
            thread: { id: crypto.randomUUID(), messages: [] },
          }),
      );
    return () => {
      cancelled = true;
    };
  }, [base]);

  const initial = loaded?.base === base ? loaded.thread : null;
  if (!initial) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        {header({ busy: false, empty: true, onNew: () => {} })}
        <div className="flex flex-1 flex-col gap-4 bg-background p-6" role="status" aria-label="Loading chat">
          {intro}
          <div className="h-4 w-3/4 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
          <div className="h-4 w-1/2 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
        </div>
      </div>
    );
  }
  return (
    <ChatSession
      key={`${base}:${initial.id}`}
      {...props}
      api={base}
      initial={initial}
      onNew={() => setLoaded({ base, thread: { id: crypto.randomUUID(), messages: [] } })}
      slots={{ header, intro, empty }}
    />
  );
}

/**
 * The chat only offers a run; the person starts it here, through the Run button's own route. Text injected into a
 * page the chat read can make it offer, never start. ponytail: the button forgets it was pressed on reload; pressing
 * again just starts another run, like the Run button.
 */
function StartAgent({ workspaceId, brandId, agentKey }: { workspaceId: string; brandId: string; agentKey: string }) {
  const [state, setState] = useState<"idle" | "starting" | "started" | { error: string }>("idle");
  const start = async () => {
    setState("starting");
    try {
      await startRun(workspaceId, brandId, agentKey);
      setState("started");
    } catch (e) {
      setState({
        error: e instanceof Error ? e.message : "Could not start the agent.",
      });
    }
  };
  if (state === "started") {
    return (
      <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Check className="size-3.5 text-success" strokeWidth={SHELL_STROKE} aria-hidden="true" /> Started the {agentKey} agent. Progress shows in Logs.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <Button size="sm" variant="outline" onClick={() => void start()} disabled={state === "starting"}>
        {state === "starting" ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Play aria-hidden="true" />}
        Start the {agentKey} agent
      </Button>
      {typeof state === "object" && (
        <span role="alert" className="text-destructive">
          {state.error}
        </span>
      )}
    </div>
  );
}

function ChatSession({
  api,
  workspaceId,
  brandId,
  initial,
  onNew,
  slots,
}: Props & {
  api: string;
  initial: Thread;
  onNew: () => void;
  slots: ChatSlots;
}) {
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const { messages, sendMessage, status, error, stop, regenerate, clearError } = useChat({
    id: initial.id,
    messages: initial.messages,
    transport: new DefaultChatTransport({
      api,
      // The server keeps the history; send only the newest message.
      prepareSendMessagesRequest: ({ messages: all, id }) => ({
        body: { id, message: all[all.length - 1] },
      }),
    }),
  });
  const busy = status === "submitted" || status === "streaming";
  const failure = error ? chatError(error) : null;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages]);

  function send(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    clearError();
    void sendMessage({ text: t });
    setInput("");
  }
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    send(input);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {slots.header({ busy, empty: messages.length === 0, onNew })}

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto bg-background p-6">
        {slots.intro}
        {/* Announce the finished reply once, not every streamed token. */}
        <p role="status" className="sr-only">
          {status === "ready" && messages.at(-1)?.role === "assistant" ? "Reply finished" : ""}
        </p>
        {messages.length === 0 ? (
          slots.empty(send)
        ) : (
          <ol className="flex flex-col gap-5">
            {/* Replies saved before ids were generated have an empty id: fall back to the position. */}
            {messages.map((m, n) => (
              <li key={m.id || `msg-${n}`} className={cn("flex flex-col gap-2", m.role === "user" && "items-end")}>
                {m.parts.map((part, i) => {
                  if (part.type === "text") {
                    return m.role === "user" ? (
                      <p key={i} className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-muted px-3.5 py-2 text-sm">
                        {part.text}
                      </p>
                    ) : (
                      <div key={i} className="text-sm [&_h3]:text-lg [&_h4]:text-base">
                        <Markdown source={part.text} />
                      </div>
                    );
                  }
                  if (part.type.startsWith("tool-")) {
                    const name = part.type.slice(5);
                    const p = part as {
                      state: string;
                      input?: Record<string, unknown>;
                      output?: { proposed?: boolean; agentKey?: string };
                    };
                    if (name === "startAgent" && p.output?.proposed && p.output.agentKey) {
                      return <StartAgent key={i} workspaceId={workspaceId} brandId={brandId} agentKey={p.output.agentKey} />;
                    }
                    const label = (TOOL_LABEL[name] ?? (() => name))(p.input);
                    const done = p.state === "output-available";
                    const failed = p.state === "output-error";
                    return (
                      <p key={i} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        {failed ? (
                          <TriangleAlert className="size-3.5 text-destructive" strokeWidth={SHELL_STROKE} aria-hidden="true" />
                        ) : done ? (
                          <Check className="size-3.5 text-success" strokeWidth={SHELL_STROKE} aria-hidden="true" />
                        ) : name === "webSearch" ? (
                          <Globe className="size-3.5 animate-pulse motion-reduce:animate-none" strokeWidth={SHELL_STROKE} aria-hidden="true" />
                        ) : (
                          <Wrench className="size-3.5 animate-pulse motion-reduce:animate-none" strokeWidth={SHELL_STROKE} aria-hidden="true" />
                        )}
                        {label}
                        {failed ? " (failed)" : done ? "" : "…"}
                      </p>
                    );
                  }
                  return null;
                })}
              </li>
            ))}
            {status === "submitted" && (
              <li className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="size-3.5 animate-spin motion-reduce:animate-none" strokeWidth={SHELL_STROKE} aria-hidden="true" /> Thinking…
              </li>
            )}
          </ol>
        )}
        {failure && (
          <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">{failure.text}</span>
            {failure.retry && (
              <Button size="sm" variant="outline" onClick={() => void regenerate()}>
                Try again
              </Button>
            )}
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form onSubmit={onSubmit} className="flex shrink-0 flex-col gap-4 border-t border-border bg-card p-6">
        <label htmlFor="chat-input" className="sr-only">
          Message Espanda
        </label>
        <textarea
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKey}
          placeholder="Ask Espanda anything…"
          className="h-34 w-full resize-none rounded-2xl border border-input bg-card p-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
        {busy ? (
          <Button type="button" variant="secondary" onClick={() => void stop()} className="h-12 w-full rounded-2xl active:translate-y-px">
            <Square aria-hidden="true" /> Stop
          </Button>
        ) : (
          <Button type="submit" disabled={!input.trim()} className="h-12 w-full rounded-2xl active:translate-y-px">
            Send message
          </Button>
        )}
      </form>
    </div>
  );
}
