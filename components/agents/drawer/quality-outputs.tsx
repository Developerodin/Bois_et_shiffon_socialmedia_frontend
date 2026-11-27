// PLACEHOLDER: replaced by drawer-b
"use client";

import type { DrawerOutputsProps } from "@/components/agents/drawer/types";
import { StageQueue } from "@/components/workspace/content-panels";

export function QualityOutputs({ base, onOpenPost }: DrawerOutputsProps) {
  return <StageQueue base={base} agentKey="quality" exclude={[]} onOpenPost={onOpenPost} />;
}

export function QualityOverview(props: DrawerOutputsProps) {
  void props;
  return null;
}
