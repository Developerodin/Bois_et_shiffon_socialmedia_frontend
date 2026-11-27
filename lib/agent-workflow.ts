import { channelsOf } from "@/lib/calendar-filter";

/**
 * The posts chain the web starts ("Plan with agents", the Ideas panel's Plan posts): the Planner with chain on, so the
 * server runs Brief writer → Creator → Quality after it, as the phone's "Generate calendar" and the scheduled automation
 * do. `channels`: plan only on these (the Planner enforces it). The runs route reads the agent's input from `input`.
 */
export function plannerChainBody(channels?: readonly string[]): string {
  return JSON.stringify({ input: channels?.length ? { chain: true, channels: [...new Set(channels)] } : { chain: true } });
}

/**
 * The six channels "Plan with agents" offers, each with the content channels the Planner may plan for it (no Reels: the
 * Planner never plans them). `filter`: the calendar filter value its connection state is read for. LinkedIn and X are
 * published by hand.
 */
export const PLAN_CHANNELS = [
  { key: "instagram", label: "Instagram", filter: "instagram", channels: ["INSTAGRAM_POST", "INSTAGRAM_CAROUSEL", "INSTAGRAM_STORY"], byHand: false },
  { key: "facebook", label: "Facebook", filter: "FACEBOOK_POST", channels: ["FACEBOOK_POST"], byHand: false },
  { key: "pinterest", label: "Pinterest", filter: "PINTEREST_PIN", channels: ["PINTEREST_PIN"], byHand: false },
  { key: "threads", label: "Threads", filter: "THREADS_POST", channels: ["THREADS_POST"], byHand: false },
  { key: "linkedin", label: "LinkedIn", filter: "LINKEDIN_POST", channels: ["LINKEDIN_POST"], byHand: true },
  { key: "x", label: "X", filter: "X_POST", channels: ["X_POST"], byHand: true },
] as const;
export type PlanChannelKey = (typeof PLAN_CHANNELS)[number]["key"];

/**
 * The options to tick when opened from a channel filter (a group ticks each of its channels); none: every one but the
 * hand ones. `hand`: whether the Planner may plan LinkedIn and X (the agents list's plannerHandChannels); off, never ticked.
 */
export function preselectedChannels(filter?: string, hand = false): PlanChannelKey[] {
  const offered = PLAN_CHANNELS.filter((c) => hand || !c.byHand);
  if (!filter) return offered.filter((c) => !c.byHand).map((c) => c.key);
  const wanted = new Set(channelsOf(filter));
  return offered.filter((c) => c.channels.some((ch) => wanted.has(ch))).map((c) => c.key);
}

/** The content channels the ticked options stand for. */
export const channelsFor = (keys: readonly string[]): string[] => PLAN_CHANNELS.filter((c) => keys.includes(c.key)).flatMap((c) => [...c.channels]);

export type StageState = "idle" | "queued" | "running" | "completed" | "failed";
export const STAGE_LABEL: Record<StageState, string> = { idle: "Idle", queued: "Queued", running: "Running", completed: "Completed", failed: "Failed" };

/** An agent's last run as the strip shows it: no run, or a failed one that had nothing to do, is Idle. */
export function stageState(lastRun: { status: string; nothingToDo?: boolean } | null | undefined): StageState {
  if (lastRun?.status === "FAILED" && lastRun.nothingToDo) return "idle";
  switch (lastRun?.status) {
    case "QUEUED":
      return "queued";
    case "RUNNING":
      return "running";
    case "SUCCEEDED":
      return "completed";
    case "FAILED":
      return "failed";
    default:
      return "idle";
  }
}

/** The posts chain's stages in order, then the Analyst apart. Keys are the agents' keys (the Overview opens /?agent=<key>). */
export const CHAIN_STAGES = [
  { key: "scout", label: "Scout" },
  { key: "planner", label: "Planner" },
  { key: "brief", label: "Brief writer" },
  { key: "creator", label: "Creator" },
  { key: "quality", label: "Quality" },
] as const;
export const ANALYST_STAGE = { key: "analyst", label: "Analyst" } as const;

type Idea = { status: string };
type Post = { status: string; studio?: boolean; latest?: { check?: { overall?: string } | null } | null };

/**
 * What waits at each stage now, across the brand (current queues, not one run's output), counted the way the agents
 * pick their work: new ideas (Scout's output, to review), shortlisted ideas (the Planner's input), planned posts with no
 * version yet (the Brief writer's), briefs without a draft (the Creator's; studio reels are written in Reels), drafts not
 * yet checked and drafts whose latest check is a blocker (Quality's), posts awaiting approval. A list not read (null)
 * gives no counts for its stages, never a guessed 0.
 * ponytail: the lists are capped (ideas: 100 newest best; posts: the calendar's 200 open + 30 days), so a bigger brand
 * undercounts. Server-side queue counts (content/summary) are the upgrade.
 */
export function workflowCounts(ideas: readonly Idea[] | null, posts: readonly Post[] | null) {
  const n = <T>(list: readonly T[] | null, test: (x: T) => boolean) => (list ? list.filter(test).length : null);
  return {
    newIdeas: n(ideas, (o) => o.status === "NEW"),
    shortlisted: n(ideas, (o) => o.status === "SHORTLISTED"),
    toBrief: n(posts, (p) => p.status === "PLANNED" && !p.studio && !p.latest),
    toDraft: n(posts, (p) => p.status === "BRIEF_READY" && !p.studio),
    toCheck: n(posts, (p) => p.status === "DRAFT_REVIEW" && !p.latest?.check),
    blocked: n(posts, (p) => p.status === "DRAFT_REVIEW" && p.latest?.check?.overall === "BLOCKER"),
    awaitingApproval: n(posts, (p) => p.status === "AWAITING_APPROVAL"),
  };
}
export type WorkflowCounts = ReturnType<typeof workflowCounts>;

/** A stage's workload state, apart from its last run: the person must act (Waiting for input, Needs attention) or not. */
export type StageFlag = "waiting" | "attention" | null;
export const FLAG_LABEL = { waiting: "Waiting for input", attention: "Needs attention" } as const;

/**
 * Planner waits for you while Scout's ideas are new and none is shortlisted; Quality needs attention while a draft is
 * blocked or a post awaits approval. Unknown counts flag nothing.
 */
export function stageFlag(key: string, c: WorkflowCounts): StageFlag {
  if (key === "planner") return c.newIdeas && c.shortlisted === 0 ? "waiting" : null;
  if (key === "quality") return c.blocked || c.awaitingApproval ? "attention" : null;
  return null;
}

/**
 * The one next step for the person, the first open dependency in this order: blocked drafts, posts waiting for a brief
 * or draft (Run the chain, from the Brief writer while posts wait for a brief, else from the Creator: the Brief writer
 * has nothing to do without planned posts and would stop the chain), shortlisted ideas to plan, new ideas to review,
 * posts awaiting approval, else create. While a chain agent is queued or running, waiting posts read as being worked
 * on ("working"), never a second start. null while the lists are not read.
 */
export type NextAction =
  | { kind: "blocked"; count: number }
  | { kind: "chain"; agent: "brief" | "creator"; toBrief: number; toDraft: number }
  | { kind: "working"; count: number }
  | { kind: "plan"; count: number }
  | { kind: "review-ideas"; count: number }
  | { kind: "approvals"; count: number }
  | { kind: "create" };

export function nextAction(c: WorkflowCounts, chainBusy: boolean): NextAction | null {
  const { newIdeas, shortlisted, toBrief, toDraft, blocked, awaitingApproval } = c;
  if (newIdeas === null || shortlisted === null || toBrief === null || toDraft === null || blocked === null || awaitingApproval === null) return null;
  if (blocked) return { kind: "blocked", count: blocked };
  if (toBrief + toDraft) return chainBusy ? { kind: "working", count: toBrief + toDraft } : { kind: "chain", agent: toBrief ? "brief" : "creator", toBrief, toDraft };
  if (shortlisted) return { kind: "plan", count: shortlisted };
  if (newIdeas) return { kind: "review-ideas", count: newIdeas };
  if (awaitingApproval) return { kind: "approvals", count: awaitingApproval };
  return { kind: "create" };
}

/** The chain's own agents (the Planner and the posts after it): one of them queued or running means the chain is going. */
export const CHAIN_AGENTS: readonly string[] = ["planner", "brief", "creator", "quality"];
