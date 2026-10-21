"use client";

import { useEffect, useRef, useState } from "react";
import { fetchEvents, type AgentEvent, type AgentEventLevel } from "@/components/agents/api";
import { ServiceUnavailable } from "@/components/agents/service-unavailable";
import { cn } from "@/lib/utils";

const POLL_MS = 3000;
const PAGE_SIZE = 100;
// Keep the DOM bounded; older lines drop off the top. Full history stays in AgentEvent.
const MAX_LINES = 500;

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "--:--:--";
  return d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

type Props = {
  workspaceId: string;
  brandId: string;
};

export function AgentLog({ workspaceId, brandId }: Props) {
  const [events, setEvents] = useState<AgentEvent[]>([]);
  const [status, setStatus] = useState<"connecting" | "live" | "error">("connecting");
  const cursorRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const poll = async () => {
      let delay = POLL_MS;
      try {
        const data = await fetchEvents(workspaceId, brandId, cursorRef.current, controller.signal);
        const batch = data.events ?? [];
        if (batch.length > 0) {
          cursorRef.current = batch[batch.length - 1].id;
          setEvents((prev) => {
            const seen = new Set(prev.map((e) => e.id));
            const next = prev.concat(batch.filter((e) => !seen.has(e.id)));
            return next.length > MAX_LINES ? next.slice(next.length - MAX_LINES) : next;
          });
          // A full page means there is likely more backlog; fetch it straight away.
          if (batch.length >= PAGE_SIZE) delay = 0;
        }
        setStatus("live");
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error("[agent-log] poll failed", err);
        setStatus("error");
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, delay);
    };

    void poll();
    return () => {
      controller.abort();
      if (timer) clearTimeout(timer);
    };
  }, [workspaceId, brandId]);

  // Auto-scroll only while the reader is already at the bottom.
  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [events]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  }

  return (
    <section aria-labelledby="agent-log-heading" className="flex flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <h2
          id="agent-log-heading"
          className="font-display text-2xl font-medium tracking-tight"
        >
          Agent Log
        </h2>
        <span className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
          <span
            className={cn(
              "size-1.5 rounded-full",
              status === "live" && "bg-success status-pulse",
              status === "connecting" && "bg-warning",
              status === "error" && "bg-destructive",
            )}
            aria-hidden="true"
          />
          {status === "live" ? "Live" : status === "connecting" ? "Connecting" : "Offline"}
        </span>
      </div>

      {status === "error" ? <ServiceUnavailable /> : null}

      <div className="overflow-hidden rounded-2xl border border-border bg-[hsl(30_10%_4%)] text-[hsl(40_22%_90%)]">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-4 py-2.5" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="ml-3 font-mono text-[11px] text-white/60">agents.log</span>
        </div>
        <div
          ref={scrollRef}
          onScroll={onScroll}
          role="log"
          aria-live="polite"
          aria-relevant="additions"
          aria-label="Agent activity log"
          tabIndex={0}
          className="h-[22rem] overflow-y-auto px-4 py-3 font-mono text-[13px] leading-6 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
        >
          {events.length === 0 ? (
            <p className="text-white/60">
              {status === "connecting"
                ? "Connecting to the agent stream…"
                : "No activity yet. Run an agent to see its work stream here."}
            </p>
          ) : (
            <ol>
              {events.map((e) => (
                <li key={e.id} className="log-line-in grid grid-cols-[auto_auto_1fr] gap-x-3">
                  <time dateTime={e.createdAt} className="text-white/50 tabular-nums">
                    {formatTime(e.createdAt)}
                  </time>
                  <span className={cn("w-16 font-semibold", LOG_LEVEL_ON_DARK[e.level])}>
                    {e.level}
                  </span>
                  <span className="min-w-0 break-words">
                    <span className="text-white/50">[{e.agentKey}]</span>{" "}
                    <span className={e.level === "INFO" ? undefined : LOG_LEVEL_ON_DARK[e.level]}>
                      {e.message}
                    </span>
                    {e.entityType ? (
                      <span className="ml-2 text-white/50">→ {e.entityType}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          )}
          <p className="text-[hsl(40_52%_62%)]" aria-hidden="true">
            <span className="typing-cursor">$</span>
          </p>
        </div>
      </div>
    </section>
  );
}

// The terminal panel is always dark (in both themes), so level colours are fixed
// values with AA contrast on its near-black background rather than theme tokens.
const LOG_LEVEL_ON_DARK: Record<AgentEventLevel, string> = {
  INFO: "text-white/70",
  SUCCESS: "text-[hsl(120_35%_62%)]",
  WARN: "text-[hsl(38_90%_64%)]",
  ERROR: "text-[hsl(4_80%_68%)]",
};
