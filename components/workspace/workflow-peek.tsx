"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchAgents, type AgentSummary } from "@/components/agents/api";
import { useAgentsPoll } from "@/components/agents/use-agents-poll";
import { ListSkeleton } from "@/components/settings/shared";
import { IdeasPanel } from "@/components/workspace/content-panels";
import { knownName } from "@/components/workspace/known-name";
import type { PeekItem } from "@/components/workspace/use-peek";
import { NotForRole } from "@/components/workspace/workspace";
import { AgentDrawer } from "@/components/agents/drawer/agent-drawer";
import { LoadFailed } from "@/components/ui/load-failed";
import { peekCrumb, peekKey, peekTitle, workflowPeekFromSearch, type WorkflowPeekView } from "@/lib/workspace-view";

/**
 * The content workflow card's peek on a page of its own (/calendar, /social): the agent a stage card opens (?agent=) or
 * Scout's Ideas panel (?peek=ideas), read from `query`. The agents list is polled only while an agent is open and the
 * role may read agents. `bad`: the URL names an agent this brand doesn't have; the page takes it out with a replace.
 * `runScout`: the Ideas panel's Get ideas, the one explicit run: it opens Scout (via `go`) and runs it once there, as on
 * the Overview. The flag lives here, never in the URL, so a reload or Back never starts a paid run.
 */
export function useWorkflowPeek({ workspaceId, brandId, perms, query, go }: { workspaceId: string; brandId: string; perms: string[]; query: string; go: (v: WorkflowPeekView) => void }) {
  const base = `/api/v1/workspaces/${encodeURIComponent(workspaceId)}/brands/${encodeURIComponent(brandId)}`;
  const canAgents = perms.includes("agents.read");
  const view = workflowPeekFromSearch(query);
  const { agents, failed: agentsFailed } = useAgentsPoll(workspaceId, brandId, view?.kind === "agent" && canAgents);
  const bad = view?.kind === "agent" && canAgents && !!agents && !agents.some((a) => a.key === view.key);
  const item: PeekItem | null =
    view && !bad
      ? view.kind === "panel"
        ? { view, title: "Ideas", crumb: "Agents › Scout" }
        : { view, title: peekTitle(view, knownName(view, { docs: null, agents, base })), crumb: peekCrumb(view) }
      : null;
  // Cleared once Scout is no longer the open item, so opening it again later never runs it again.
  const [runKey, setRunKey] = useState<string | null>(null);
  const openKey = view ? peekKey(view) : null;
  useEffect(() => {
    if (openKey !== "agent:scout") setRunKey(null);
  }, [openKey]);
  const runScout = () => {
    setRunKey("scout");
    go({ kind: "agent", key: "scout" });
  };
  return { view, item, agents, agentsFailed, bad, base, autoRunKey: runKey, runScout };
}

/**
 * What the workflow peek shows: the Ideas panel, or the agent drawer for the open agent (a skeleton until the agents
 * list has it, a retry if it can't be read). `live` is false while it slides out: that snapshot never auto-runs. Documents open on the Overview.
 */
export function WorkflowPeekBody({
  view,
  live,
  base,
  workspaceId,
  brandId,
  perms,
  agents,
  autoRunKey,
  onRunScout,
  onOpenPost,
  onOpenPosts,
  agentsFailed = false,
}: {
  view: WorkflowPeekView;
  live: boolean;
  base: string;
  workspaceId: string;
  brandId: string;
  perms: string[];
  agents: AgentSummary[] | null;
  autoRunKey: string | null;
  onRunScout: () => void;
  onOpenPost: (id: string) => void;
  onOpenPosts: () => void;
  /** The agents list's last read failed (with no list yet: a retry instead of an endless skeleton). */
  agentsFailed?: boolean;
}) {
  const canRun = perms.includes("agents.run");
  // A fresh read after a run reaches the polled list through the shared request.
  const refreshAgents = useCallback(() => void fetchAgents(workspaceId, brandId, true).catch(() => {}), [workspaceId, brandId]);
  if (view.kind === "panel") return <IdeasPanel base={base} perms={perms} onRunScout={onRunScout} onOpenPosts={onOpenPosts} onOpenPost={onOpenPost} />;
  if (!perms.includes("agents.read")) return <NotForRole what="the agents" />;
  const agent = agents?.find((a) => a.key === view.key);
  if (!agent) {
    return <div className="px-6 py-6">{agentsFailed ? <LoadFailed what="the agents" onRetry={refreshAgents} /> : <ListSkeleton label="Loading" rows={3} />}</div>;
  }
  return (
    <AgentDrawer
      agentKey={view.key}
      autoRun={live && canRun && autoRunKey === view.key}
      canRun={canRun}
      perms={perms}
      agent={agent}
      workspaceId={workspaceId}
      brandId={brandId}
      onRan={refreshAgents}
      onOpenPosts={onOpenPosts}
      onOpenPost={onOpenPost}
    />
  );
}
