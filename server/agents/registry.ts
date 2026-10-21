import { analystAgent } from "@/server/agents/definitions/analyst";
import { briefAgent } from "@/server/agents/definitions/brief";
import { competitorsAgent } from "@/server/agents/definitions/competitors";
import { creatorAgent } from "@/server/agents/definitions/creator";
import { geoAgent } from "@/server/agents/definitions/geo";
import { plannerAgent } from "@/server/agents/definitions/planner";
import { qualityAgent } from "@/server/agents/definitions/quality";
import { researchAgent } from "@/server/agents/definitions/research";
import { scoutAgent } from "@/server/agents/definitions/scout";
import { seoAgent } from "@/server/agents/definitions/seo";
import { siteAuditAgent } from "@/server/agents/definitions/site-audit";
import { systemsCheckAgent } from "@/server/agents/definitions/systems-check";
import type { AgentDefinition } from "@/server/agents/types";

/** All agents known to the platform, in pipeline order. Per-brand enablement lives in BrandAgentConfig. */
export const AGENTS: readonly AgentDefinition[] = [
  researchAgent,
  scoutAgent,
  plannerAgent,
  briefAgent,
  creatorAgent,
  qualityAgent,
  analystAgent,
  seoAgent,
  geoAgent,
  competitorsAgent,
  siteAuditAgent,
  systemsCheckAgent,
];

export function getAgent(key: string): AgentDefinition | undefined {
  return AGENTS.find((a) => a.key === key);
}
