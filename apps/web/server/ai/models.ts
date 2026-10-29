/**
 * Which model does which task, and what each call costs.
 *
 * Tasks are grouped by how hard they are, not given a model each: a new workflow lands in "medium" until someone
 * moves it. The tiers were chosen on our own tasks (2026-10-29 comparison, scripts/_tmp/model-bench.ts):
 * - heavy: writing that shapes everything else or reaches customers (strategy documents, post drafts, the check
 *   before approval). gpt-6.1-sol wrote the most natural French and gave the most precise review notes.
 * - medium: reading, finding and structuring (lookup, summary, ideas, audits, chat). gpt-6.1-terra matched the
 *   others on accuracy and was the fastest at every one of them.
 * - light: short, low-stakes calls where an invented answer is fine. gpt-6-luna is the cheapest, but it broke a
 *   "copy exactly, never invent" rule in the comparison, so nothing that quotes the brand goes here.
 * Each tier's model can be changed in .env (AI_MODEL_HEAVY / AI_MODEL_MEDIUM / AI_MODEL_LIGHT) without a code change.
 */
export type Tier = "heavy" | "medium" | "light";

const DEFAULT_MODEL: Record<Tier, string> = { heavy: "gpt-6.1-sol", medium: "gpt-6.1-terra", light: "gpt-6-luna" };
const ENV: Record<Tier, string> = { heavy: "AI_MODEL_HEAVY", medium: "AI_MODEL_MEDIUM", light: "AI_MODEL_LIGHT" };

/** Workflow ids (or "prefix." for a whole agent) per tier. Anything not listed is medium. */
const TIERS: Record<Exclude<Tier, "medium">, string[]> = {
  heavy: [
    "research.product-information",
    "research.marketing-strategy",
    "research.brand-voice",
    "research.content-strategy",
    "creator.",
    "quality.",
  ],
  light: ["systems-check.", "geo.questions"],
};

export function tierFor(workflowId: string): Tier {
  const listed = (ids: string[]) => ids.some((id) => (id.endsWith(".") ? workflowId.startsWith(id) : workflowId === id));
  return listed(TIERS.heavy) ? "heavy" : listed(TIERS.light) ? "light" : "medium";
}

export function modelFor(workflowId: string) {
  const tier = tierFor(workflowId);
  return { tier, model: process.env[ENV[tier]] || DEFAULT_MODEL[tier] };
}

/**
 * OpenAI list prices in USD per 1M tokens (input, cached input, output), standard tier, short context
 * (https://developers.openai.com/api/docs/pricing, read 2026-10-29). Web search: $10 per 1,000 calls.
 * ponytail: a hand-kept table; a model missing here logs tokens with costUsd null, so add it when you add a model.
 */
const PRICES: Record<string, [number, number, number]> = {
  "gpt-6-astra": [10, 1, 50],
  "gpt-6.1-sol": [2, 0.1, 10],
  "gpt-6.1-terra": [1, 0.05, 5],
  "gpt-6-sol": [2, 0.2, 10],
  "gpt-6-luna": [0.1, 0.01, 0.5],
  "gpt-5.6-sol": [4, 0.4, 20],
  "gpt-5.6-terra": [2, 0.2, 12],
  "gpt-5.6-luna": [0.2, 0.02, 1.2],
  "gpt-5.5": [5, 0.5, 30],
  "gpt-5.4": [2.5, 0.25, 15],
  "gpt-5.4-mini": [0.75, 0.075, 4.5],
  "gpt-5.4-nano": [0.2, 0.02, 1.25],
  "gpt-5-mini": [0.25, 0.025, 2],
  "gpt-5-nano": [0.05, 0.005, 0.4],
  "gpt-4.1": [2, 0.5, 8],
  "gpt-4.1-mini": [0.4, 0.1, 1.6],
  "gpt-4.1-nano": [0.1, 0.025, 0.4],
};
const WEB_SEARCH_USD = 0.01;

export type AiUsage = { inputTokens?: number; cachedInputTokens?: number; outputTokens?: number; reasoningTokens?: number; webSearchCalls?: number };

/** List price of one call; null when the model isn't in the table (or for the mock provider). */
export function aiCostUsd(model: string, u: AiUsage): number | null {
  const price = PRICES[model];
  if (!price) return null;
  const [input, cached, output] = price;
  const cachedTokens = u.cachedInputTokens ?? 0;
  return (
    (((u.inputTokens ?? 0) - cachedTokens) * input + cachedTokens * cached + (u.outputTokens ?? 0) * output) / 1e6 +
    (u.webSearchCalls ?? 0) * WEB_SEARCH_USD
  );
}
