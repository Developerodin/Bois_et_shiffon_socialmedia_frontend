"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronUp, MessageCircle, SquareTerminal } from "lucide-react";
import { AgentLog } from "@/components/agents/agent-log";
import { ASSISTANT_TOGGLE_ID, useAssistant } from "@/components/shell/assistant-state";
import { SHELL_STROKE } from "@/components/shell/icon";
import { navFor } from "@/lib/nav";
import { cn } from "@/lib/utils";

type Props = { brandName: string | null; workspaceId: string | null; brandId: string | null };

const LOGS_KEY = "ws.logsOpen";

const tool =
  "flex h-11 items-center gap-2 rounded-2xl px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px";

/** 72 px bar: breadcrumb on the left, the Logs drawer toggle and (below 1280 px) the assistant toggle on the right. */
export function TopBar({ brandName, workspaceId, brandId }: Props) {
  const { title, brandScoped } = navFor(usePathname());
  const { open: assistantOpen, setOpen: setAssistantOpen } = useAssistant();
  const [logsOpen, setLogsOpen] = useState(false);
  useEffect(() => {
    try {
      setLogsOpen(localStorage.getItem(LOGS_KEY) === "1");
    } catch {
      // storage blocked: default closed
    }
  }, []);
  const toggleLogs = () =>
    setLogsOpen((o) => {
      try {
        localStorage.setItem(LOGS_KEY, o ? "0" : "1");
      } catch {
        // ignore
      }
      return !o;
    });

  return (
    <div className="sticky top-0 z-30 bg-card">
      <header className="flex h-18 items-center gap-3 px-8">
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1 text-sm">
            {brandScoped && brandName ? (
              <>
                <li className="min-w-0 truncate text-muted-foreground">{brandName}</li>
                <li aria-hidden="true" className="shrink-0 text-muted-foreground">
                  <ChevronRight className="size-4" strokeWidth={SHELL_STROKE} />
                </li>
              </>
            ) : null}
            <li aria-current="page" className="min-w-0 truncate text-foreground">
              {title}
            </li>
          </ol>
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          {brandId && (
            <button type="button" id="logs-toggle" onClick={toggleLogs} onKeyDown={(e) => e.key === "Escape" && logsOpen && toggleLogs()} aria-expanded={logsOpen} aria-controls="agent-log-drawer" className={cn(tool, logsOpen && "bg-accent text-primary-strong")}>
              <SquareTerminal className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
              Logs
              <ChevronUp className={cn("size-4 transition-transform motion-reduce:transition-none", !logsOpen && "rotate-180")} strokeWidth={SHELL_STROKE} aria-hidden="true" />
            </button>
          )}
          {/* Same condition as the layout's AssistantPanel: no workspace, no panel to open. */}
          {workspaceId && (
            <button type="button" id={ASSISTANT_TOGGLE_ID} onClick={() => setAssistantOpen(!assistantOpen)} aria-haspopup="dialog" aria-expanded={assistantOpen} className={cn(tool, "xl:hidden")}>
              <MessageCircle className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
              Espanda
            </button>
          )}
        </div>
      </header>

      {workspaceId && brandId && (
        <div
          id="agent-log-drawer"
          onKeyDown={(e) => {
            if (e.key === "Escape" && logsOpen) {
              toggleLogs();
              document.getElementById("logs-toggle")?.focus();
            }
          }}
          className={cn("border-t border-border bg-background", logsOpen ? "block" : "hidden")}>
          <div className="max-h-[38vh] overflow-hidden px-8 py-2">{logsOpen && <AgentLog key={brandId} workspaceId={workspaceId} brandId={brandId} compact />}</div>
        </div>
      )}
    </div>
  );
}
