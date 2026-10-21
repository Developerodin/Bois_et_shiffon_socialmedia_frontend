import { researchAgent } from "@/server/agents/definitions/research";
import { systemsCheckAgent } from "@/server/agents/definitions/systems-check";
import type { AgentDefinition } from "@/server/agents/types";

/** All agents known to the platform. Per-brand enablement lives in BrandAgentConfig. */
export const AGENTS: readonly AgentDefinition[] = [researchAgent, systemsCheckAgent];

export function getAgent(key: string): AgentDefinition | undefined {
  return AGENTS.find((a) => a.key === key);
}
