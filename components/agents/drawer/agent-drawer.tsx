"use client";

import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Bot, Loader2, RotateCw } from "lucide-react";
import type { AgentSummary } from "@/components/agents/api";
import { ActivityTab } from "@/components/agents/drawer/activity";
import { BriefOutputs } from "@/components/agents/drawer/brief-outputs";
import { CreatorOutputs } from "@/components/agents/drawer/creator-outputs";
import { PlannerOverview, PlannerOutputs } from "@/components/agents/drawer/planner-outputs";
import { QualityOutputs, QualityOverview } from "@/components/agents/drawer/quality-outputs";
import { ScoutOutputs, ScoutOverview } from "@/components/agents/drawer/scout-outputs";
import { DrawerSection, runItems, Stat } from "@/components/agents/drawer/shared";
import type { DrawerData, DrawerOutputsProps } from "@/components/agents/drawer/types";
import { useRunEvents } from "@/components/agents/run-events";
import { useRunAgent } from "@/components/agents/use-run-agent";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { useBrandData, type ContentItem } from "@/components/workspace/content-panels";
import { PeekSlot } from "@/components/workspace/peek";
import { AGENT_META, LearningNotes, useLearningNotes } from "@/components/workspace/workspace";
import { readable } from "@/lib/agent-message";
import { hasBrief } from "@/lib/agent-drawer";
import { nothingToDo } from "@/lib/agent-runs";
import { STAGE_LABEL, stageState, workflowCounts, type StageState, type WorkflowCounts } from "@/lib/agent-workflow";
import { withPrice } from "@/lib/plan-credits";
import type { Tone } from "@/lib/status";
import { clockTime, timeAgo } from "@/lib/time";
import { cn } from "@/lib/utils";

type Tab = "overview" | "outputs" | "activity";
const TABS: readonly { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "outputs", label: "Outputs" },
  { key: "activity", label: "Activity" },
];
const STATE_TONE: Record<StageState, Tone> = { idle: "muted", queued: "info", running: "info", completed: "good", failed: "bad" };
/** The agents whose Overview and Outputs read the posts list (their own blocks; Scout's and Quality's read their own). */
const READS_POSTS = new Set(["planner", "brief", "creator"]);

/** What waits at and after an agent's stage across the brand, counted as the agents pick their work (workflowCounts). */
const WORKLOAD: Record<string, readonly { key: keyof WorkflowCounts; label: string }[]> = {
  planner: [{ key: "toBrief", label: "Planned, waiting for a brief" }],
  brief: [
    { key: "toBrief", label: "Waiting for a brief" },
    { key: "toDraft", label: "Briefed, waiting for a draft" },
  ],
  creator: [
    { key: "toDraft", label: "Waiting for a draft" },
    { key: "blocked", label: "Sent back by Quality: revisions required" },
    { key: "toCheck", label: "Drafted, waiting for the quality check" },
  ],
};

const pickItems = (d: { items: ContentItem[] }) => d.items;

/**
 * The agent detail drawer in the workflow peek (calendar, Channels): a header (icon, what it does, its state, last run,
 * Run again) and the tabs Overview · Outputs · Activity in the peek's sticky header, the tab's content in the body, and
 * the agent's main next action in the sticky footer. Opening it or switching tabs never starts a run; only Run again
 * (with `agents.run`) or `autoRun` (Scout's one-click Get ideas, once per mount) does. The tab is kept while the
 * agents poll hands a new `agent`; the caller remounts it per agent.
 */
export function AgentDrawer({
  agentKey,
  agent,
  workspaceId,
  brandId,
  perms,
  canRun,
  autoRun = false,
  onRan,
  onOpenPost,
  onOpenPosts,
}: {
  agentKey: string;
  agent: AgentSummary;
  workspaceId: string;
  brandId: string;
  perms: string[];
  canRun: boolean;
  autoRun?: boolean;
  onRan: () => void;
  onOpenPost: (id: string) => void;
  /** The posts on the calendar: "View in calendar". */
  onOpenPosts: () => void;
}) {
  const [tab, setTab] = useState<Tab>("outputs");
  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  const { pending, error, running, price, run } = useRunAgent({ workspaceId, brandId, agentKey, agent, autoRun, onRan });
  const last = agent.lastRun;
  const events = useRunEvents(workspaceId, brandId, agentKey, last?.id ?? null, last ? `${last.id}:${last.status}` : undefined);
  const { data: posts, failed: postsFailed, reload: reloadPosts } = useBrandData(base, "content", pickItems as (d: never) => ContentItem[], READS_POSTS.has(agentKey));
  const d: DrawerData = { base, workspaceId, brandId, perms, agent, agentKey, onOpenPost, onRan, run: events, posts: posts ?? null, postsFailed, reloadPosts };
  const contract: DrawerOutputsProps = { base, workspaceId, brandId, perms, agent, onOpenPost, onRan };
  const state = nothingToDo(agent) ? "idle" : stageState(last);
  const Icon = AGENT_META[agentKey]?.icon ?? Bot;
  const at = last?.finishedAt ?? last?.startedAt ?? null;

  // Arrow keys move between the tabs (and select), as a tab list does.
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const onTabKey = useCallback((e: KeyboardEvent, i: number) => {
    const dir = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const n = (i + dir + TABS.length) % TABS.length;
    setTab(TABS[n]!.key);
    tabRefs.current[n]?.focus();
  }, []);

  let body: ReactNode;
  if (tab === "activity") body = <ActivityTab d={d} />;
  else if (tab === "overview") body = <OverviewTab d={d} contract={contract} running={running} />;
  else body = <OutputsTab d={d} contract={contract} />;

  return (
    <div className="@container flex min-w-0 flex-col">
      <PeekSlot to="header">
        <div className="flex flex-col gap-2">
          <div className="flex items-start gap-2">
            <Icon className={cn("mt-0.5 size-4 shrink-0", AGENT_META[agentKey]?.tint ?? "text-primary-strong")} aria-hidden="true" />
            <p className="line-clamp-2 text-xs text-muted-foreground">{agent.description}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
            <StatusBadge tone={STATE_TONE[state]}>{nothingToDo(agent) ? "Nothing to do" : STAGE_LABEL[state]}</StatusBadge>
            <span className="text-xs text-muted-foreground">{at ? `Last run ${timeAgo(at)}` : "Not run yet"}</span>
            {canRun && (
              <Button size="sm" variant="outline" className="ml-auto" onClick={() => void run()} disabled={pending || running}>
                {pending || running ? <Loader2 className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <RotateCw aria-hidden="true" />}
                {running ? "Running…" : withPrice(last ? "Run again" : "Run", price)}
              </Button>
            )}
          </div>
          {error && <p role="alert" className="text-xs text-destructive">{error}</p>}
          <div role="tablist" aria-label="Agent details" className="-mb-3 flex gap-4">
            {TABS.map((t, i) => (
              <button
                key={t.key}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`agent-tab-${t.key}`}
                aria-selected={tab === t.key}
                aria-controls="agent-tabpanel"
                tabIndex={tab === t.key ? 0 : -1}
                onClick={() => setTab(t.key)}
                onKeyDown={(e) => onTabKey(e, i)}
                className={cn(
                  "border-b-2 pb-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none",
                  tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </PeekSlot>
      <div id="agent-tabpanel" role="tabpanel" aria-labelledby={`agent-tab-${tab}`} className="flex min-w-0 flex-col gap-6 px-5 py-5">
        {body}
      </div>
      {agentKey === "planner" && (
        <PeekSlot to="footer">
          <Button size="sm" variant="outline" className="w-full" onClick={onOpenPosts}>
            View in calendar
          </Button>
        </PeekSlot>
      )}
    </div>
  );
}

function OutputsTab({ d, contract }: { d: DrawerData; contract: DrawerOutputsProps }) {
  switch (d.agentKey) {
    case "scout":
      return <ScoutOutputs {...contract} />;
    case "planner":
      return <PlannerOutputs d={d} />;
    case "brief":
      return <BriefOutputs d={d} />;
    case "creator":
      return <CreatorOutputs d={d} />;
    case "quality":
      return <QualityOutputs {...contract} />;
    case "analyst":
      return <LearningNotes workspaceId={d.workspaceId} brandId={d.brandId} />;
    default:
      return <p className="text-sm text-muted-foreground">This agent&rsquo;s results show on their own page.</p>;
  }
}

/** Overview: the last execution, the agent's own numbers, its current workload and the next step. */
function OverviewTab({ d, contract, running }: { d: DrawerData; contract: DrawerOutputsProps; running: boolean }) {
  const last = d.agent?.lastRun;
  const idle = nothingToDo(d.agent ?? undefined);
  const counts = d.posts ? workflowCounts(null, d.posts) : null;
  const rows = WORKLOAD[d.agentKey] ?? [];
  return (
    <>
      <DrawerSection id="last-exec-h" title="Last execution">
        {last ? (
          <>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Stat label="State" value={idle ? "Nothing to do" : STAGE_LABEL[stageState(last)]} />
              <Stat label={last.finishedAt ? "Finished" : "Started"} value={last.finishedAt ? clockTime(last.finishedAt) : last.startedAt ? clockTime(last.startedAt) : "Waiting to start"} />
            </dl>
            {last.status === "FAILED" && last.error && <p className={cn("text-sm", idle ? "text-muted-foreground" : "text-destructive")}>{readable(last.error)}</p>}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">It hasn&rsquo;t run yet for this business.</p>
        )}
      </DrawerSection>

      {d.agentKey === "scout" && <ScoutOverview {...contract} />}
      {d.agentKey === "quality" && <QualityOverview {...contract} />}
      {d.agentKey === "planner" && <PlannerOverview d={d} />}
      {(d.agentKey === "brief" || d.agentKey === "creator") && <RunCounts d={d} />}
      {d.agentKey === "analyst" && <AnalystOverview d={d} />}

      {rows.length > 0 && (
        <DrawerSection id="workload-h" title="Current workload" scope="Waiting now across all posts">
          {counts ? (
            <dl className="grid grid-cols-1 gap-2">
              {rows.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-3 text-sm">
                  <dt className="min-w-0 text-muted-foreground">{r.label}</dt>
                  <dd className="shrink-0 font-medium tabular-nums">{counts[r.key]}</dd>
                </div>
              ))}
            </dl>
          ) : d.postsFailed ? (
            <p className="text-sm text-muted-foreground">Couldn&rsquo;t read your posts.</p>
          ) : (
            <p className="text-sm text-muted-foreground">Counting…</p>
          )}
        </DrawerSection>
      )}

      <NextStep agentKey={d.agentKey} counts={counts} running={running} />
    </>
  );
}

/** Brief writer and Creator: what their latest run made, from the posts the list could read. */
function RunCounts({ d }: { d: DrawerData }) {
  const read = runItems(d);
  if (!read || (!read.items.length && !read.missing.length)) return null;
  const made = d.agentKey === "brief" ? read.items.filter((p) => hasBrief(p.brief)).length : read.items.filter((p) => p.latest).length;
  const channels = new Set(read.items.map((p) => p.channel)).size;
  return (
    <DrawerSection id="run-counts-h" title="Latest run" scope="From the posts it worked on">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-lg bg-muted/50 px-3 py-3 @sm:grid-cols-3">
        <Stat label="Posts worked on" value={read.items.length + read.missing.length} />
        <Stat label={d.agentKey === "brief" ? "With a brief now" : "With a draft now"} value={made} />
        <Stat label="Channels" value={channels} />
      </dl>
    </DrawerSection>
  );
}

function AnalystOverview({ d }: { d: DrawerData }) {
  const { notes, failed } = useLearningNotes(d.workspaceId, d.brandId);
  return (
    <DrawerSection id="learning-h" title="Learning" scope="Its notes, read by the other agents">
      <p className="text-sm text-muted-foreground">
        {failed ? "Couldn't read its notes." : !notes ? "Reading its notes…" : notes.length ? `${notes.length === 10 ? "10 latest" : notes.length} note${notes.length === 1 ? "" : "s"}, newest ${timeAgo(notes[0]!.createdAt)}. They're in Outputs.` : "No notes yet. Run the Analyst to write the first one."}
      </p>
    </DrawerSection>
  );
}

/** The one next step, from real counts only; nothing when there is none to say. */
function NextStep({ agentKey, counts, running }: { agentKey: string; counts: WorkflowCounts | null; running: boolean }) {
  let text: string | null = null;
  if (running) text = "Working now. Its results show in Outputs as it goes.";
  else if (counts) {
    const n = (k: keyof WorkflowCounts) => counts[k] ?? 0;
    if (agentKey === "planner" && n("toBrief")) text = `${n("toBrief")} planned post${n("toBrief") === 1 ? "" : "s"} wait for the Brief writer.`;
    if (agentKey === "brief") text = n("toBrief") ? `${n("toBrief")} planned post${n("toBrief") === 1 ? "" : "s"} wait for a brief: run it again to write them.` : n("toDraft") ? `${n("toDraft")} brief${n("toDraft") === 1 ? "" : "s"} wait for the Creator.` : null;
    if (agentKey === "creator") {
      const todo = n("toDraft") + n("blocked");
      text = todo ? `${todo} post${todo === 1 ? "" : "s"} wait for a draft or a rewrite: run it again to write them.` : n("toCheck") ? `${n("toCheck")} draft${n("toCheck") === 1 ? "" : "s"} wait for the Quality check.` : null;
    }
  }
  if (!text) return null;
  return (
    <DrawerSection id="next-h" title="Next step">
      <p className="text-sm">{text}</p>
    </DrawerSection>
  );
}
