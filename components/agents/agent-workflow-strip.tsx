"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { CalendarDays, ChevronDown, ChevronRight, Compass, FileText, LineChart, LoaderCircle, PenLine, ShieldCheck, type LucideIcon } from "lucide-react";
import type { AgentSummary } from "@/components/agents/api";
import { PlanWithAgents } from "@/components/agents/plan-with-agents";
import { ensureWorkLanguage, isRunCancelled } from "@/components/languages/languages";
import { errorMessage, request } from "@/components/settings/api";
import { useRunPrice } from "@/components/shell/use-plan-credits";
import { Button } from "@/components/ui/button";
import { fetchShared, JOB_INTERVALS, useJob } from "@/components/workspace/use-job";
import { ANALYST_STAGE, CHAIN_AGENTS, CHAIN_STAGES, FLAG_LABEL, nextAction, STAGE_LABEL, stageFlag, stageState, workflowCounts, type NextAction, type StageFlag, type StageState, type WorkflowCounts } from "@/lib/agent-workflow";
import { calendarHref } from "@/lib/calendar-filter";
import { loadPlanCredits, withPrice, workspaceIdOf } from "@/lib/plan-credits";
import { timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

const COLLAPSED_KEY = "agent-strip.collapsed.v1";
// Module-level: useJob restarts its polling when these change.
const pickAgents = (d: { agents: AgentSummary[] }) => d.agents;
const pickIdeas = (d: { opportunities: { status: string }[] }) => d.opportunities;
const pickPosts = (d: { items: { status: string; studio?: boolean; latest?: { check?: { overall?: string } | null } | null }[] }) => d.items;
const SHOWN = new Set<string>([...CHAIN_STAGES.map((s) => s.key), ANALYST_STAGE.key]);
const going = (run: AgentSummary["lastRun"] | undefined) => run?.status === "QUEUED" || run?.status === "RUNNING";
const busy = (agents: AgentSummary[]) => agents.some((a) => SHOWN.has(a.key) && going(a.lastRun));
// Polls only while a run is queued or running: an idle brand reads the list once (a run started here refreshes it).
const idle = (agents: AgentSummary[]) => !busy(agents);
const once = () => true;
const DOT: Record<StageState, string> = { idle: "bg-muted-foreground/40", queued: "bg-primary/40", running: "bg-primary", completed: "bg-success", failed: "bg-destructive" };
const FLAG_DOT: Record<NonNullable<StageFlag>, string> = { waiting: "bg-warning", attention: "bg-destructive" };
const ICON: Record<string, LucideIcon> = { scout: Compass, planner: CalendarDays, brief: FileText, creator: PenLine, quality: ShieldCheck, analyst: LineChart };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const focusRing = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/** A stage's queue count, its label, an extra line and its next step, from the current queues. */
function stageWork(key: string, c: WorkflowCounts): { count: number | null; label: string; extra?: string; next: string } {
  switch (key) {
    case "scout":
      return { count: c.newIdeas, label: "new ideas to review", next: c.newIdeas ? "Review ideas" : "Find ideas" };
    case "planner":
      return { count: c.shortlisted, label: "ideas shortlisted", next: c.shortlisted ? "Plan selected ideas" : c.newIdeas ? "Shortlist ideas first" : "Waits for ideas" };
    case "brief":
      return { count: c.toBrief, label: "posts waiting for a brief", next: c.toBrief ? "Write briefs" : "Nothing waiting" };
    case "creator":
      return { count: c.toDraft, label: "posts waiting for a draft", next: c.toDraft ? "Write drafts" : "Nothing waiting" };
    default:
      return {
        count: c.toCheck,
        label: "drafts to check",
        extra: c.blocked === null ? undefined : `${c.blocked} blocked · ${c.awaitingApproval} awaiting approval`,
        next: c.blocked ? "Review blocked drafts" : c.toCheck ? "Check drafts" : c.awaitingApproval ? "Review approvals" : "Nothing waiting",
      };
  }
}

/** The banner's sentence for a next step (also the collapsed line's). */
function nextTitle(n: NextAction): string {
  switch (n.kind) {
    case "blocked":
      return `${plural(n.count, "draft needs", "drafts need")} attention`;
    case "chain":
      return n.toBrief && n.toDraft
        ? `${plural(n.toBrief, "post is", "posts are")} waiting for a brief, ${n.toDraft} for a draft`
        : n.toBrief
          ? `${plural(n.toBrief, "post is", "posts are")} waiting for a brief`
          : `${plural(n.toDraft, "post is", "posts are")} waiting for a draft`;
    case "working":
      return `The agents are working on ${plural(n.count, "post", "posts")}`;
    case "plan":
      return `${plural(n.count, "shortlisted idea is", "shortlisted ideas are")} ready to plan`;
    case "review-ideas":
      return `${plural(n.count, "new idea is", "new ideas are")} ready for review`;
    case "approvals":
      return `${plural(n.count, "post is", "posts are")} awaiting approval`;
    case "create":
      return "Nothing is waiting for you";
  }
}

const NEXT_NOTE: Record<NextAction["kind"], string> = {
  blocked: "Quality found a blocking issue in these drafts. Fix them, or send them back to the Creator.",
  chain: "Run the chain: each post gets its brief, draft and quality check, then waits for your approval.",
  working: "Each post gets its brief, draft and quality check, then waits for your approval.",
  plan: "The Planner turns them into dated posts; the Brief writer, Creator and Quality then prepare each one.",
  "review-ideas": "Scout's ideas wait for you: shortlist the ones worth planning.",
  approvals: "They passed the quality check and wait for your decision.",
  create: "Pick channels and let the agents plan, write and check new posts.",
};

function Dot({ state, flag }: { state: StageState; flag?: StageFlag }) {
  if (!flag && state === "running") return <LoaderCircle aria-hidden className="size-3 shrink-0 animate-spin text-primary motion-reduce:animate-none" />;
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", flag ? FLAG_DOT[flag] : DOT[state])} />;
}

/**
 * The content workflow: a next-step banner (the first open dependency, one action), the five production stages
 * (Scout → Planner → Brief writer → Creator → Quality), each with its last run's state, what waits for it now and its
 * next step, and the Analyst apart as the learning agent. Counts are the brand's current queues from the ideas and the
 * calendar's list (shared requests other panels already make), never one run's output. A stage opens its agent on the
 * Overview (never starts it). Collapsible, remembered per browser. Only for roles that read agents; starting runs needs
 * agents.run.
 * TODO(Phase 2): a workflow scope line (products · channels · planned posts) once a workflow record is persisted; the
 * posts don't carry one shared scope today, so nothing is shown rather than a guess.
 */
export function AgentWorkflowStrip({ base, perms, className }: { base: string; perms: string[]; className?: string }) {
  const canRead = perms.includes("agents.read");
  const canRun = perms.includes("agents.run");
  const agents = useJob(`${base}/agents`, { pick: pickAgents as (d: never) => AgentSummary[], done: idle, intervals: JOB_INTERVALS.agents, off: !canRead }).data;
  const running = agents ? busy(agents) : false;
  // Ideas and posts move with the runs: read again while one goes, once otherwise.
  const ideas = useJob(`${base}/opportunities`, { pick: pickIdeas as (d: never) => { status: string }[], done: running ? undefined : once, intervals: JOB_INTERVALS.always, off: !canRead }).data;
  const posts = useJob(`${base}/content`, { pick: pickPosts as (d: never) => { status: string }[], done: running ? undefined : once, intervals: JOB_INTERVALS.always, off: !canRead }).data;
  const workspaceId = workspaceIdOf(base);
  const price = { brief: useRunPrice(workspaceId, "brief"), creator: useRunPrice(workspaceId, "creator"), analyst: useRunPrice(workspaceId, "analyst") };
  const [starting, setStarting] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
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
  // As Plan with agents starts one: the team language first, then the run; the strips share the agents list and poll.
  async function start(agent: string, input?: object) {
    setStarting(agent);
    setRunError(null);
    try {
      await ensureWorkLanguage(base);
      await request(`${base}/agents/${encodeURIComponent(agent)}/runs`, { method: "POST", body: JSON.stringify(input ? { input } : {}) });
      if (workspaceId) void loadPlanCredits(workspaceId, true);
      void fetchShared(`${base}/agents`, true).catch(() => undefined);
    } catch (e) {
      if (!isRunCancelled(e)) setRunError(errorMessage(e, "Couldn't start the agent. Try again."));
    } finally {
      setStarting(null);
    }
  }
  if (!canRead || !agents) return null;
  const runOf = (key: string) => agents.find((a) => a.key === key)?.lastRun;
  const counts = workflowCounts(ideas, posts);
  const next = nextAction(counts, agents.some((a) => CHAIN_AGENTS.includes(a.key) && going(a.lastRun)));
  const failed = CHAIN_STAGES.some((s) => stageState(runOf(s.key)) === "failed");
  const overall: { dot: string; label: string } | null = running
    ? { dot: DOT.running, label: "Agents at work" }
    : failed
      ? { dot: DOT.failed, label: "An agent's last run failed" }
      : !next
        ? null
        : next.kind === "blocked" || next.kind === "approvals"
          ? { dot: FLAG_DOT.attention, label: "Needs attention" }
          : next.kind === "create"
            ? { dot: DOT.idle, label: "Nothing waiting" }
            : { dot: FLAG_DOT.waiting, label: "Waiting for you" };

  const action = (n: NextAction): ReactNode => {
    switch (n.kind) {
      case "blocked":
        return <Button asChild size="sm"><Link href={calendarHref({ status: "toWrite", need: "blocked" })}>Review issues</Link></Button>;
      case "chain":
        return canRun ? (
          <Button size="sm" onClick={() => void start(n.agent, { chain: true })} disabled={starting !== null}>
            {starting === n.agent && <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />}
            {withPrice("Run the chain", price[n.agent])}
          </Button>
        ) : null;
      case "plan":
        return <PlanWithAgents base={base} perms={perms} label="Plan selected ideas" />;
      case "review-ideas":
        return <Button asChild size="sm"><Link href="/?peek=ideas">Review ideas</Link></Button>;
      case "approvals":
        return <Button asChild size="sm"><Link href={calendarHref({ status: "awaiting" })}>Review approvals</Link></Button>;
      case "create":
        return <PlanWithAgents base={base} perms={perms} label="Create with agents" variant="outline" />;
      default:
        return null;
    }
  };

  const analystRun = runOf(ANALYST_STAGE.key);
  const analystState = stageState(analystRun);
  const analystWhen = timeAgo(analystRun?.finishedAt ?? analystRun?.startedAt);

  return (
    <section aria-label="Content workflow" className={cn("@container/wf min-w-0 rounded-xl border border-border bg-card", className)}>
      <button type="button" onClick={toggle} aria-expanded={!collapsed} className={cn("flex min-h-11 w-full min-w-0 items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-muted/50", focusRing)}>
        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-medium">Content workflow</span>
          <span className="text-xs text-muted-foreground">5 production agents · 1 learning agent</span>
        </span>
        {overall && (
          <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span aria-hidden className={cn("size-2 rounded-full", overall.dot)} />
            <span className="hidden @min-[24rem]/wf:inline">{overall.label}</span>
          </span>
        )}
        {collapsed ? <ChevronRight aria-hidden className="size-4 shrink-0" /> : <ChevronDown aria-hidden className="size-4 shrink-0" />}
      </button>
      {collapsed ? (
        next && <p className="-mt-1 truncate px-3 pb-2 text-xs text-muted-foreground">Next: {nextTitle(next)}</p>
      ) : (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          {next && (
            <div role="status" className="flex flex-col gap-2 rounded-lg border border-border bg-muted/40 p-3 @min-[34rem]/wf:flex-row @min-[34rem]/wf:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Next action</p>
                <p className="text-sm font-medium">{nextTitle(next)}</p>
                <p className="text-xs text-muted-foreground">{NEXT_NOTE[next.kind]}</p>
              </div>
              <div className="shrink-0">{action(next)}</div>
            </div>
          )}
          {runError && <p role="alert" className="text-xs text-destructive">{runError}</p>}
          {/* One row on a wide container, 3 + 2 at medium, a vertical list on narrow. Each connector lives in its stage's
              item, so it can never wrap onto a line of its own. */}
          <ol className="grid grid-cols-1 gap-2 @min-[34rem]/wf:grid-cols-3 @min-[34rem]/wf:gap-3 @min-[56rem]/wf:grid-cols-5 @min-[56rem]/wf:gap-4">
            {CHAIN_STAGES.map((s, i) => {
              const run = runOf(s.key);
              const state = stageState(run);
              const flag = stageFlag(s.key, counts);
              // A run going or failed says more than the workload; otherwise the workload's flag replaces Idle/Completed.
              const shownFlag = flag && (state === "idle" || state === "completed") ? flag : null;
              const work = stageWork(s.key, counts);
              const Icon = ICON[s.key];
              return (
                <li key={s.key} className="relative min-w-0">
                  {i > 0 && (
                    <>
                      <span aria-hidden className="absolute -top-2 left-5 h-2 w-px bg-border @min-[34rem]/wf:hidden" />
                      <span aria-hidden className="absolute top-1/2 -left-4 hidden w-4 -translate-y-1/2 justify-center text-muted-foreground @min-[56rem]/wf:flex">
                        <ChevronRight className="size-3.5" />
                      </span>
                    </>
                  )}
                  <Link
                    href={`/?agent=${encodeURIComponent(s.key)}`}
                    aria-label={`${s.label}: ${shownFlag ? FLAG_LABEL[shownFlag] : STAGE_LABEL[state]}, last run ${STAGE_LABEL[state].toLowerCase()}. ${work.count ?? "unknown"} ${work.label}. Next: ${work.next}`}
                    className={cn("flex h-full min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-background p-2.5 text-xs hover:border-foreground/25 hover:bg-muted/40", focusRing)}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="text-muted-foreground tabular-nums">{String(i + 1).padStart(2, "0")}</span>
                      <Icon aria-hidden className="size-3.5 shrink-0 text-primary-strong" />
                      <span className="truncate font-medium text-foreground">{s.label}</span>
                    </span>
                    <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground" title={`Last run: ${STAGE_LABEL[state]}`}>
                      <Dot state={state} flag={shownFlag} />
                      <span className="truncate">{shownFlag ? FLAG_LABEL[shownFlag] : STAGE_LABEL[state]}</span>
                    </span>
                    <span className="flex min-w-0 items-baseline gap-1.5">
                      <span className="text-lg leading-tight font-semibold tabular-nums text-foreground">{work.count ?? "–"}</span>
                      <span className="min-w-0 text-muted-foreground">{work.label}</span>
                    </span>
                    {work.extra && <span className="text-muted-foreground">{work.extra}</span>}
                    <span className="mt-auto truncate text-muted-foreground">Next: <span className="text-foreground">{work.next}</span></span>
                  </Link>
                </li>
              );
            })}
          </ol>
          <p className="text-xs text-muted-foreground">Counts are what waits now across all your ideas and posts, not the output of one run.</p>
          {/* The Analyst learns from results; it is not a step of the chain and never blocks it. */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-dashed border-border p-2.5 text-xs">
            <Link href={`/?agent=${ANALYST_STAGE.key}`} className={cn("flex min-h-9 min-w-0 items-center gap-1.5 rounded-md pr-1 hover:underline", focusRing)}>
              <LineChart aria-hidden className="size-3.5 shrink-0 text-primary-strong" />
              <span className="font-medium">{ANALYST_STAGE.label}</span>
              <span className="text-muted-foreground">· Learning</span>
            </Link>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Dot state={analystState} />
              {STAGE_LABEL[analystState]}
              {analystWhen && ` · ${analystWhen}`}
            </span>
            <span className="min-w-0 flex-1 basis-48 text-muted-foreground">Learns from your published posts&apos; results. Outside the chain.</span>
            {canRun && (
              <Button size="sm" variant="outline" onClick={() => void start(ANALYST_STAGE.key)} disabled={starting !== null || going(analystRun)}>
                {(starting === ANALYST_STAGE.key || going(analystRun)) && <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />}
                {withPrice("Run analysis", price.analyst)}
              </Button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
