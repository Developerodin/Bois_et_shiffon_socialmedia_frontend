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
type Post = { status: string; latest?: { check?: { overall?: string } | null } | null };

/**
 * What waits at each stage, from lists the page already reads: new ideas (Scout's output), shortlisted ideas (the
 * Planner's input), planned posts without a brief, briefs without a draft, drafts not yet checked, posts awaiting
 * approval. A list not read (null) gives no counts for its stages, never a guessed 0.
 */
export function workflowCounts(ideas: readonly Idea[] | null, posts: readonly Post[] | null) {
  const n = <T>(list: readonly T[] | null, test: (x: T) => boolean) => (list ? list.filter(test).length : null);
  return {
    newIdeas: n(ideas, (o) => o.status === "NEW"),
    shortlisted: n(ideas, (o) => o.status === "SHORTLISTED"),
    toBrief: n(posts, (p) => p.status === "PLANNED"),
    toDraft: n(posts, (p) => p.status === "BRIEF_READY"),
    toCheck: n(posts, (p) => p.status === "DRAFT_REVIEW" && !p.latest?.check),
    awaitingApproval: n(posts, (p) => p.status === "AWAITING_APPROVAL"),
  };
}
