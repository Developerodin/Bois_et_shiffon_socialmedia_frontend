import type { Tier } from "@/server/ai/models";
import { prisma } from "@/server/db/prisma";

/** One model's settings (AiModel). Prices in USD per 1M tokens. */
export type ModelInfo = {
  name: string;
  input: number;
  cached: number;
  output: number;
  cacheBreakpoints: boolean;
  evalCandidate: boolean;
  judgeRank: number | null;
};
export type ModelConfig = { models: Map<string, ModelInfo>; tiers: Partial<Record<Tier, { model: string; backup: string | null }>> };

const TTL_MS = 60_000;
let cache: { at: number; value: Promise<ModelConfig> } | null = null;

/**
 * The AI model settings (Platform admin → AI models), read from the database at most once a minute per server instance.
 * ponytail: a change saved on one instance reaches the others within a minute (the saving one at once); a shared
 * cache or a change notification if that ever matters.
 */
export function modelConfig(): Promise<ModelConfig> {
  if (!cache || Date.now() - cache.at > TTL_MS) {
    const value = load();
    cache = { at: Date.now(), value };
    // A failed read isn't kept: the next call tries the database again.
    value.catch(() => {
      if (cache?.value === value) cache = null;
    });
  }
  return cache.value;
}

/** After a change: this instance re-reads on its next call. */
export const forgetModelConfig = () => {
  cache = null;
};

async function load(): Promise<ModelConfig> {
  const [models, tiers] = await Promise.all([prisma.aiModel.findMany(), prisma.aiTier.findMany()]);
  return {
    models: new Map(
      models.map((m) => [
        m.name,
        { name: m.name, input: Number(m.inputUsdPerM), cached: Number(m.cachedUsdPerM), output: Number(m.outputUsdPerM), cacheBreakpoints: m.cacheBreakpoints, evalCandidate: m.evalCandidate, judgeRank: m.judgeRank },
      ]),
    ),
    tiers: Object.fromEntries(tiers.map((t) => [t.tier, { model: t.model, backup: t.backup }])),
  };
}
