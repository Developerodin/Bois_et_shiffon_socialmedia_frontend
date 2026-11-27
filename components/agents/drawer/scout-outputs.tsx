// PLACEHOLDER: replaced by drawer-b
"use client";

import type { DrawerOutputsProps } from "@/components/agents/drawer/types";
import { useRunAgent } from "@/components/agents/use-run-agent";
import { IdeasPanel } from "@/components/workspace/content-panels";

export function ScoutOutputs({ base, workspaceId, brandId, perms, agent, onOpenPost, onRan }: DrawerOutputsProps) {
  const { running, run } = useRunAgent({ workspaceId, brandId, agentKey: "scout", agent, onRan });
  if (running) return null;
  return <IdeasPanel key={agent?.lastRun?.finishedAt ?? "none"} base={base} perms={perms} onRunScout={() => void run()} onOpenPost={onOpenPost} />;
}

export function ScoutOverview(props: DrawerOutputsProps) {
  void props;
  return null;
}
