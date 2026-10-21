import { geoAgent } from "@/server/agents/definitions/geo";
import { researchAgent } from "@/server/agents/definitions/research";
import { seoAgent } from "@/server/agents/definitions/seo";
import { systemsCheckAgent } from "@/server/agents/definitions/systems-check";
import type { AgentDefinition } from "@/server/agents/types";

/** All agents known to the platform. Per-brand enablement lives in BrandAgentConfig. */
export const AGENTS: readonly AgentDefinition[] = [researchAgent, seoAgent, geoAgent, systemsCheckAgent];

export function getAgent(key: string): AgentDefinition | undefined {
  return AGENTS.find((a) => a.key === key);
}
