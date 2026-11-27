import type { AgentEvent, AgentSummary } from "@/components/agents/api";
import type { ContentItem } from "@/components/workspace/content-panels";

/** What every agent's Outputs and Overview blocks get (the contract Scout's and Quality's files are written to). */
export type DrawerOutputsProps = { base: string; workspaceId: string; brandId: string; perms: string[]; agent: AgentSummary | null; onOpenPost: (id: string) => void; onRan: () => void };

/**
 * The drawer's shared reads for the chain agents' own blocks: the latest run's events (one read for Outputs and
 * Activity) and the brand's posts list (the calendar's shared, polled request).
 */
export type DrawerData = DrawerOutputsProps & {
  agentKey: string;
  /** The latest run's events: null while read (or no run), `failed` when the read failed. */
  run: { events: AgentEvent[] | null; failed: boolean; retry: () => void };
  posts: ContentItem[] | null;
  postsFailed: boolean;
  reloadPosts: () => void;
};
