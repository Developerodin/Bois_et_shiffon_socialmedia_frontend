/**
 * Which tier does which task, and what each call costs.
 *
 * Tasks are grouped by how hard they are, not given a model each: a new workflow lands in "medium" until someone
 * moves it. Which model each tier uses, its backup, and every model's price live in the database (AiTier, AiModel),
 * set by platform admins on Platform admin → AI models; this file holds no model names. Read them with modelConfig()
 * (server/ai/model-config.ts) and pass the result in.
 * The tiers (from the 2026-10-29 comparison and the test set, scripts/evals):
 * - heavy: writing that shapes everything else or reaches customers (strategy documents, post drafts, the check
 *   before approval). Needs the model that writes the most natural French and gives the most precise review notes.
 * - medium: reading, finding and structuring (lookup, summary, ideas, audits, chat). Accuracy and speed.
 * - light: short, low-stakes calls where a loose answer is fine. Nothing that quotes the brand goes here: the
 *   cheapest model tested returned a section heading when asked for the site's slogan.
 * Before changing a tier's model, run the test set against the new one (npm run eval -w web -- --models <name>).
 */
import type { ModelConfig } from "@/server/ai/model-config";

export type Tier = "heavy" | "medium" | "light";

/** Workflow ids (or "prefix." for a whole agent) per tier. Anything not listed is medium. */
const TIERS: Record<Exclude<Tier, "medium">, string[]> = {
  heavy: [
    "research.product-information",
    "research.marketing-strategy",
    "research.brand-voice",
    "research.content-strategy",
    "creator.",
    "quality.",
    "reels.script",
  ],
  light: ["systems-check.", "geo.questions", "reels.seam"],
};

const RANK: Record<Tier, number> = { light: 0, medium: 1, heavy: 2 };
/**
 * AI_MAX_TIER (light | medium) caps every call, retries included: cheap test runs on a dev box. Unset in production.
 * The ledger records the tier a call actually ran on.
 */
const capped = (tier: Tier): Tier => {
  const cap = process.env.AI_MAX_TIER as Tier | undefined;
  return cap && cap in RANK && RANK[tier] > RANK[cap] ? cap : tier;
};

export function tierFor(workflowId: string): Tier {
  const listed = (ids: string[]) => ids.some((id) => (id.endsWith(".") ? workflowId.startsWith(id) : workflowId === id));
  return capped(listed(TIERS.heavy) ? "heavy" : listed(TIERS.light) ? "light" : "medium");
}

/** No model is set for a tier: an AI call can't go anywhere until a platform admin picks one. */
export class ModelNotConfiguredError extends Error {
  constructor(readonly tier: Tier) {
    super(`No AI model is set for the ${tier} tier. A platform admin sets it in Platform admin → AI models.`);
    this.name = "ModelNotConfiguredError";
  }
}

export function modelForTier(cfg: ModelConfig, tier: Tier): string {
  const set = cfg.tiers[tier];
  if (!set) throw new ModelNotConfiguredError(tier);
  return set.model;
}

export function modelFor(cfg: ModelConfig, workflowId: string) {
  const tier = tierFor(workflowId);
  return { tier, model: modelForTier(cfg, tier) };
}

/** Where an answer that failed its check goes next (FrugalGPT-style cascade): one tier up; heavy is the top. */
export const nextTier = (tier: Tier): Tier | null => {
  const up: Tier | null = tier === "light" ? "medium" : tier === "medium" ? "heavy" : null;
  return up && capped(up) === up ? up : null;
};

/**
 * When a tier's model is unavailable (rate limited, down, retired), the call tries one other model: the tier's
 * backup, else each higher tier's model, the first that isn't the one that just failed. Admins pick backups of the
 * same standing or better, so an outage doesn't quietly lower quality.
 * ponytail: one backup per tier; a health-scored pool (Copilot-style) if outages become routine.
 */
export function fallbackModel(cfg: ModelConfig, tier: Tier, failed: string): string | null {
  const candidates = [cfg.tiers[tier]?.backup];
  for (let up = nextTier(tier); up; up = nextTier(up)) candidates.push(cfg.tiers[up]?.model);
  return candidates.find((m): m is string => !!m && m !== failed) ?? null;
}

// OpenAI's pricing rules, the same for every model (https://developers.openai.com/api/docs/pricing, read 2026-10-29).
const WEB_SEARCH_USD = 0.01; // per hosted web search call
/** Writing input to the cache (30-minute lifetime, the default) is billed at 1.25× the input price, in place of it. */
const CACHE_WRITE = 1.25;

export type AiUsage = { inputTokens?: number; cachedInputTokens?: number; cacheWriteTokens?: number; outputTokens?: number; reasoningTokens?: number; webSearchCalls?: number };

/** List price of one call; null when the model has no price in Platform admin → AI models (or for the mock provider). */
export function aiCostUsd(cfg: ModelConfig, model: string, u: AiUsage): number | null {
  const price = cfg.models.get(model);
  if (!price) return null;
  const cachedTokens = u.cachedInputTokens ?? 0;
  const written = u.cacheWriteTokens ?? 0;
  return (
    (((u.inputTokens ?? 0) - cachedTokens - written) * price.input + written * price.input * CACHE_WRITE + cachedTokens * price.cached + (u.outputTokens ?? 0) * price.output) / 1e6 +
    (u.webSearchCalls ?? 0) * WEB_SEARCH_USD
  );
}
