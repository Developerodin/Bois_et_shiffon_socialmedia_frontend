"use client";

import { useState } from "react";
import { ChevronDown, Copy } from "lucide-react";
import { AgentEventRow } from "@/components/agents/agent-log";
import type { AgentEvent, AgentEventLevel } from "@/components/agents/api";
import { DrawerSection, OpenPost } from "@/components/agents/drawer/shared";
import type { DrawerData } from "@/components/agents/drawer/types";
import { ListSkeleton } from "@/components/settings/shared";
import { LoadFailed } from "@/components/ui/load-failed";
import { StatusBadge } from "@/components/ui/status-badge";
import { readable } from "@/lib/agent-message";
import { levelCounts, logText, milestones } from "@/lib/agent-drawer";
import { nothingToDo } from "@/lib/agent-runs";
import { clockTime } from "@/lib/time";
import { cn } from "@/lib/utils";

const LEVELS: readonly AgentEventLevel[] = ["INFO", "SUCCESS", "WARN", "ERROR"];
const LEVEL_LABEL: Record<AgentEventLevel, string> = { INFO: "Info", SUCCESS: "Success", WARN: "Warning", ERROR: "Error" };
const RUN_LABEL = { QUEUED: "Queued", RUNNING: "Running", SUCCEEDED: "Completed", FAILED: "Failed" } as const;
const RUN_TONE = { QUEUED: "info", RUNNING: "info", SUCCEEDED: "good", FAILED: "bad" } as const;
/** The server sends at most this many events for one run. */
const RUN_EVENT_CAP = 200;

/**
 * Activity: the latest run as a readable timeline (start, its successes, warnings and errors, end), then the full log
 * collapsed under "Advanced execution logs" with level filters and Copy.
 * ponytail: only the latest run; the events route reads an agent's events only with a run id, so earlier runs need a
 * server change (a per-agent run list) before they can be listed here.
 */
export function ActivityTab({ d }: { d: DrawerData }) {
  const last = d.agent?.lastRun;
  if (!last) return <p className="text-sm text-muted-foreground">No runs yet, so nothing to show.</p>;
  const events = d.run.events;
  const idle = nothingToDo(d.agent ?? undefined);
  return (
    <>
      <DrawerSection id="activity-h" title="Latest run" scope="Earlier runs aren't listed here yet">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <StatusBadge tone={idle ? "muted" : RUN_TONE[last.status]}>{idle ? "Nothing to do" : RUN_LABEL[last.status]}</StatusBadge>
          {last.startedAt && <span className="text-muted-foreground">Started {clockTime(last.startedAt)}</span>}
          {last.finishedAt && <span className="text-muted-foreground">· Finished {clockTime(last.finishedAt)}</span>}
        </div>
        {last.status === "FAILED" && last.error && <p className={cn("text-sm", idle ? "text-muted-foreground" : "text-destructive")}>{readable(last.error)}</p>}
        {d.run.failed && !events ? (
          <LoadFailed what="what it did" onRetry={d.run.retry} />
        ) : !events ? (
          <ListSkeleton label="Loading its run" rows={2} />
        ) : (
          <Timeline events={events} onOpenPost={d.onOpenPost} />
        )}
      </DrawerSection>
      {events && events.length > 0 && <AdvancedLog events={events} />}
    </>
  );
}

function Timeline({ events, onOpenPost }: { events: AgentEvent[]; onOpenPost: (id: string) => void }) {
  if (!events.length) return <p className="text-sm text-muted-foreground">Nothing was logged for this run.</p>;
  const marks = milestones(events);
  if (!marks.length) return <p className="text-sm text-muted-foreground">{events.length} steps logged, all routine. The full log is below.</p>;
  return (
    <ol className="relative flex flex-col gap-3 border-l border-border pl-4">
      {marks.map((e) => (
        <li key={e.id} className="relative">
          <span aria-hidden="true" className={cn("absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background", e.level === "ERROR" ? "bg-destructive" : e.level === "WARN" ? "bg-warning" : "bg-success")} />
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <time dateTime={e.createdAt}>{clockTime(e.createdAt)}</time>
            <span>{LEVEL_LABEL[e.level]}</span>
          </div>
          <div className="flex items-start justify-between gap-3">
            <p className="min-w-0 break-words text-sm">{readable(e.message)}</p>
            {e.entityType === "ContentItem" && e.entityId && <OpenPost id={e.entityId} onOpenPost={onOpenPost} />}
          </div>
        </li>
      ))}
    </ol>
  );
}

/** The run's full log, collapsed by default: level filters, Copy (what the filters show), the terminal lines. */
function AdvancedLog({ events }: { events: AgentEvent[] }) {
  const [open, setOpen] = useState(false);
  const [levels, setLevels] = useState<ReadonlySet<AgentEventLevel>>(() => new Set(LEVELS));
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  const counts = levelCounts(events);
  const shown = events.filter((e) => levels.has(e.level));
  const toggle = (l: AgentEventLevel) =>
    setLevels((s) => {
      const next = new Set(s);
      if (next.has(l)) next.delete(l);
      else next.add(l);
      return next;
    });
  const copy = () => {
    if (!navigator.clipboard) return setCopied("failed");
    navigator.clipboard.writeText(logText(shown)).then(
      () => setCopied("done"),
      () => setCopied("failed"),
    );
  };
  return (
    <section aria-labelledby="adv-log-h" className="flex flex-col gap-3 border-t border-border pt-4">
      <h3 id="adv-log-h">
        <button type="button" aria-expanded={open} aria-controls="adv-log" onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 rounded-sm text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span>
            Advanced execution logs <span className="font-normal text-muted-foreground">· {events.length}{events.length >= RUN_EVENT_CAP ? " (first 200)" : ""}</span>
          </span>
          <ChevronDown className={cn("size-4 transition-transform motion-reduce:transition-none", open && "rotate-180")} aria-hidden="true" />
        </button>
      </h3>
      {open && (
        <div id="adv-log" className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {LEVELS.map((l) => (
              <button key={l} type="button" aria-pressed={levels.has(l)} onClick={() => toggle(l)} className={cn("rounded-full border px-2.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", levels.has(l) ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:bg-muted")}>
                {LEVEL_LABEL[l]} <span className="tabular-nums">{counts[l]}</span>
              </button>
            ))}
            <button type="button" onClick={copy} disabled={!shown.length} className="ml-auto inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50">
              <Copy className="size-3.5" aria-hidden="true" />
              {copied === "done" ? "Copied" : copied === "failed" ? "Couldn't copy" : "Copy"}
            </button>
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-lg bg-terminal px-3 py-2 font-mono text-xs leading-5 text-terminal-foreground">
            {shown.length ? (
              <ol>
                {shown.map((e) => (
                  <AgentEventRow key={e.id} event={e} />
                ))}
              </ol>
            ) : (
              <p className="text-white/60">No lines at the chosen levels.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
