"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, LoaderCircle } from "lucide-react";
import type { AgentSummary } from "@/components/agents/api";
import { JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { ANALYST_STAGE, CHAIN_STAGES, STAGE_LABEL, stageState, workflowCounts, type StageState } from "@/lib/agent-workflow";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "agent-strip.collapsed.v1";
// Module-level: useJob restarts its polling when these change.
const pickAgents = (d: { agents: AgentSummary[] }) => d.agents;
const pickIdeas = (d: { opportunities: { status: string }[] }) => d.opportunities;
const pickPosts = (d: { items: { status: string; latest?: { check?: { overall?: string } | null } | null }[] }) => d.items;
const busy = (agents: AgentSummary[]) => agents.some((a) => a.lastRun?.status === "QUEUED" || a.lastRun?.status === "RUNNING");
// Polls only while a run is queued or running: an idle brand reads the list once (a run started here refreshes it).
const idle = (agents: AgentSummary[]) => !busy(agents);
const once = () => true;
const DOT: Record<StageState, string> = { idle: "bg-muted-foreground/40", queued: "bg-amber-500", running: "bg-sky-500", completed: "bg-emerald-500", failed: "bg-destructive" };

/**
 * The content workflow at a glance: Scout → Planner → Brief writer → Creator → Quality, the Analyst apart. Each stage
 * shows its agent's last run (Idle, Queued, Running, Completed, Failed) and what waits for it, counted from the ideas and
 * the calendar's list (shared requests other panels already make). A stage opens its agent on the Overview.
 * Collapsible, remembered per browser. Only for roles that read agents.
 */
export function AgentWorkflowStrip({ base, perms, className }: { base: string; perms: string[]; className?: string }) {
  const canRead = perms.includes("agents.read");
  const agents = useJob(`${base}/agents`, { pick: pickAgents as (d: never) => AgentSummary[], done: idle, intervals: JOB_INTERVALS.agents, off: !canRead }).data;
  const running = agents ? busy(agents) : false;
  // Ideas and posts move with the runs: read again while one goes, once otherwise.
  const ideas = useJob(`${base}/opportunities`, { pick: pickIdeas as (d: never) => { status: string }[], done: running ? undefined : once, intervals: JOB_INTERVALS.always, off: !canRead }).data;
  const posts = useJob(`${base}/content`, { pick: pickPosts as (d: never) => { status: string }[], done: running ? undefined : once, intervals: JOB_INTERVALS.always, off: !canRead }).data;
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSED_KEY) === "1");
    } catch {
      // storage blocked: open
    }
  }, []);
  const toggle = () => {
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSED_KEY, c ? "0" : "1");
      } catch {
        // ignore
      }
      return !c;
    });
  };
  if (!canRead || !agents) return null;
  const counts = workflowCounts(ideas, posts);
  const waiting: Record<string, string | null> = {
    scout: counts.newIdeas === null ? null : `${counts.newIdeas} new`,
    planner: counts.shortlisted === null ? null : `${counts.shortlisted} shortlisted`,
    brief: counts.toBrief === null ? null : `${counts.toBrief} to brief`,
    creator: counts.toDraft === null ? null : `${counts.toDraft} to draft`,
    quality: counts.toCheck === null ? null : `${counts.toCheck} to check`,
    analyst: null,
  };
  const stage = (s: { key: string; label: string }) => {
    const state = stageState(agents.find((a) => a.key === s.key)?.lastRun);
    return (
      <Link
        key={s.key}
        href={`/?agent=${encodeURIComponent(s.key)}`}
        className="flex min-h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11"
      >
        {state === "running" ? <LoaderCircle aria-hidden className="size-3 animate-spin text-sky-500 motion-reduce:animate-none" /> : <span aria-hidden className={cn("size-2 rounded-full", DOT[state])} />}
        <span className="font-medium text-foreground">{s.label}</span>
        <span className="text-muted-foreground">
          {STAGE_LABEL[state]}
          {waiting[s.key] && ` · ${waiting[s.key]}`}
        </span>
      </Link>
    );
  };
  return (
    <section aria-label="Content workflow" className={cn("min-w-0 rounded-xl border border-border bg-card", className)}>
      <div className="flex items-center gap-2 px-2 py-1">
        <button type="button" onClick={toggle} aria-expanded={!collapsed} className="flex min-h-9 items-center gap-1.5 rounded-md px-1 text-xs font-medium hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring pointer-coarse:min-h-11">
          {collapsed ? <ChevronRight aria-hidden className="size-4" /> : <ChevronDown aria-hidden className="size-4" />}
          Content workflow
        </button>
        {collapsed && (
          <span className="truncate text-xs text-muted-foreground">
            {running ? "Agents at work" : "Idle"}
            {counts.awaitingApproval ? ` · ${counts.awaitingApproval} awaiting approval` : ""}
          </span>
        )}
      </div>
      {!collapsed && (
        // Wraps rather than scrolling sideways: no horizontal overflow inside the page.
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-border px-2 py-1">
          <ol className="flex min-w-0 flex-wrap items-center gap-y-1">
            {CHAIN_STAGES.map((s, i) => (
              <li key={s.key} className="flex items-center">
                {i > 0 && <span aria-hidden className="px-0.5 text-muted-foreground">→</span>}
                {stage(s)}
              </li>
            ))}
            {counts.awaitingApproval !== null && (
              <li className="flex items-center">
                <span aria-hidden className="px-0.5 text-muted-foreground">→</span>
                <Link href="/calendar?cf_status=awaiting" className="flex min-h-9 items-center rounded-md px-2 text-xs text-muted-foreground hover:bg-muted pointer-coarse:min-h-11">
                  {counts.awaitingApproval} awaiting approval
                </Link>
              </li>
            )}
          </ol>
          {stage(ANALYST_STAGE)}
        </div>
      )}
    </section>
  );
}
