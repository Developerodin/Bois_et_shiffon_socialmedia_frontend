"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChevronRight, ChevronUp, Coins, MessageCircle, MoreHorizontal, SquareTerminal } from "lucide-react";
import { AgentLog } from "@/components/agents/agent-log";
import { ASSISTANT_TOGGLE_ID, useAssistant } from "@/components/shell/assistant-state";
import { CREDITS_POPOVER_ID, CreditsChip } from "@/components/shell/credits-chip";
import { NotificationBell } from "@/components/shell/notification-bell";
import { QuickCreate } from "@/components/shell/quick-create";
import { SearchBox } from "@/components/shell/search-box";
import { SHELL_STROKE, tool } from "@/components/shell/icon";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { assistantDocks, navFor } from "@/lib/nav";
import { brandBase } from "@/lib/tasks-api";
import { cn } from "@/lib/utils";

/**
 * `agents`: the role reads agents on this business (agents.read): the assistant and the Logs drawer are for those roles.
 * `features`: the web flags on for this workspace; `perms`: the role's keys on the active business.
 */
type Props = { brandName: string | null; workspaceId: string | null; brandId: string | null; userId: string; nav?: ReactNode; agents: boolean; features: readonly string[]; perms: readonly string[] };

const LOGS_KEY = "ws.logsOpen";
export const TOPBAR_SLOT_ID = "topbar-slot";

/**
 * 72 px bar: breadcrumb on the left, the Logs drawer toggle and (wherever the assistant isn't docked: below 1280 px, or a page that doesn't dock it) the assistant toggle on the right.
 * Below 1280 px credits and Logs move into a "More" menu, and below 768 px the breadcrumb is for screen readers only
 * (each page has its own heading). Budget at the worst case, the Overview (it portals Recent, and Layout from 1024 px):
 * a phone's 358 px row holds Menu, Search, New, the bell, Recent, More and the assistant toggle, seven 44 px icons with
 * 4 px gaps; at 768 px the page title comes back beside the labelled Search, New and Recent; at 1024 px Menu, Layout and
 * the assistant gain labels; the business joins the breadcrumb from 1280 px. Adding a tool to the bar means checking
 * that budget again.
 */
export function TopBar({ brandName, workspaceId, brandId, userId, nav, agents, features, perms }: Props) {
  const pathname = usePathname();
  const { title, brandScoped } = navFor(pathname);
  const { open: assistantOpen, setOpen: setAssistantOpen } = useAssistant();
  // The More menu's trigger (Radix owns its id): where focus goes back to from Logs and Credits opened through it.
  const moreRef = useRef<HTMLButtonElement>(null);
  const creditsPicked = useRef(false);
  const tasksOn = features.includes("tasks");
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
      <header className="flex h-18 items-center gap-3 px-4 sm:px-6">
        {nav}
        <nav aria-label="Breadcrumb" className="min-w-0 flex-1">
          <ol className="flex min-w-0 items-center gap-1 text-sm max-md:sr-only">
            {brandScoped && brandName ? (
              <>
                {/* The business shows from 1280 px; below that it is in the Menu sheet and the row needs the room. */}
                <li className="min-w-0 truncate text-muted-foreground max-xl:sr-only">{brandName}</li>
                <li aria-hidden="true" className="shrink-0 text-muted-foreground max-xl:hidden">
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
          {/* Search and "+" work on the active business; the "+" offers only what the role may create. */}
          {tasksOn && workspaceId && brandId && perms.includes("brand.read") && <SearchBox base={brandBase(workspaceId, brandId)} />}
          {tasksOn && workspaceId && brandId && <QuickCreate base={brandBase(workspaceId, brandId)} perms={perms} userId={userId} />}
          {workspaceId && <CreditsChip workspaceId={workspaceId} className="max-xl:hidden" />}
          {/* Notifications are per person across the workspace's businesses; the server lists only tasks they can see. */}
          {tasksOn && workspaceId && <NotificationBell workspaceId={workspaceId} brandId={brandId} />}
          {/* The Overview's panel layout portals its Layout menu here (one header band instead of two). */}
          <div id={TOPBAR_SLOT_ID} className="contents" />
          {brandId && agents && (
            <button type="button" id="logs-toggle" onClick={toggleLogs} onKeyDown={(e) => e.key === "Escape" && logsOpen && toggleLogs()} aria-expanded={logsOpen} aria-controls="agent-log-drawer" className={cn(tool, "max-xl:hidden", logsOpen && "bg-accent text-primary-strong")}>
              <SquareTerminal className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
              <span>Logs</span>
              <ChevronUp className={cn("size-4 transition-transform motion-reduce:transition-none", !logsOpen && "rotate-180")} strokeWidth={SHELL_STROKE} aria-hidden="true" />
            </button>
          )}
          {workspaceId && (
            <DropdownMenu>
              {/* Escape here closes an open Logs drawer, as it does on the Logs button. */}
              <DropdownMenuTrigger ref={moreRef} aria-label="More" onKeyDown={(e) => e.key === "Escape" && logsOpen && toggleLogs()} className={cn(tool, "xl:hidden")}>
                <MoreHorizontal className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(e) => {
                  if (!creditsPicked.current) return;
                  creditsPicked.current = false;
                  // Instead of focus going back to More: open the chip's own popover (hidden chip, so no invoker) and
                  // focus it, so it is announced and Tab reaches "Try again". When it closes with focus inside it, or
                  // nowhere, focus comes back to More.
                  e.preventDefault();
                  const pop = document.getElementById(CREDITS_POPOVER_ID);
                  if (!pop) return;
                  const back = (ev: Event) => {
                    if ((ev as ToggleEvent).newState !== "closed") return;
                    pop.removeEventListener("toggle", back);
                    const at = document.activeElement;
                    if (!at || at === document.body || pop.contains(at)) moreRef.current?.focus();
                  };
                  pop.addEventListener("toggle", back);
                  pop.showPopover();
                  pop.focus();
                }}
              >
                <DropdownMenuItem onSelect={() => (creditsPicked.current = true)}>
                  <Coins className="size-4" strokeWidth={SHELL_STROKE} aria-hidden="true" />
                  Credits
                </DropdownMenuItem>
                {brandId && agents && (
                  <DropdownMenuCheckboxItem checked={logsOpen} onCheckedChange={toggleLogs} aria-controls="agent-log-drawer">
                    Logs
                  </DropdownMenuCheckboxItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          {/* Same condition as the layout's AssistantPanel: no workspace (or a role without agents.read), no panel to open. */}
          {workspaceId && agents && (
            <button type="button" id={ASSISTANT_TOGGLE_ID} onClick={() => setAssistantOpen(!assistantOpen)} aria-haspopup="dialog" aria-expanded={assistantOpen} className={cn(tool, assistantDocks(pathname) && "xl:hidden")}>
              <MessageCircle className="size-5" strokeWidth={SHELL_STROKE} aria-hidden="true" />
              <span className="sr-only lg:not-sr-only">Bois & Chiffons</span>
            </button>
          )}
        </div>
      </header>

      {workspaceId && brandId && agents && (
        <div
          id="agent-log-drawer"
          onKeyDown={(e) => {
            if (e.key === "Escape" && logsOpen) {
              toggleLogs();
              // Back to whichever opener is on screen: the Logs button, or the More menu where it is hidden.
              const logs = document.getElementById("logs-toggle");
              (logs?.offsetParent ? logs : moreRef.current)?.focus();
            }
          }}
          className={cn("border-t border-border bg-background", logsOpen ? "block" : "hidden")}>
          <div className="max-h-[38vh] overflow-hidden px-4 py-2 sm:px-6">{logsOpen && <AgentLog key={brandId} workspaceId={workspaceId} brandId={brandId} compact />}</div>
        </div>
      )}
    </div>
  );
}
