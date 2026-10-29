/**
 * Model routing and cost checks (server/ai/models.ts). No network, no database.
 * Run: npm run check:models -w web
 */
import assert from "node:assert/strict";
import { aiCostUsd, modelFor, tierFor } from "@/server/ai/models";

// Tiers: listed ids, whole-agent prefixes, and the medium default for anything new.
assert.equal(tierFor("research.brand-voice"), "heavy");
assert.equal(tierFor("creator.revise"), "heavy");
assert.equal(tierFor("quality.review"), "heavy");
assert.equal(tierFor("research.competitor-analysis"), "medium");
assert.equal(tierFor("research.summary"), "medium");
assert.equal(tierFor("geo.questions"), "light");
assert.equal(tierFor("geo.visibility"), "medium");
assert.equal(tierFor("systems-check.briefing"), "light");
assert.equal(tierFor("some-new-agent.task"), "medium");
assert.equal(tierFor("creatorx.draft"), "medium"); // a prefix needs its dot

// .env overrides a tier's model; empty falls back to the default.
process.env.AI_MODEL_HEAVY = "gpt-6-astra";
assert.deepEqual(modelFor("creator.draft"), { tier: "heavy", model: "gpt-6-astra" });
process.env.AI_MODEL_HEAVY = "";
assert.equal(modelFor("creator.draft").model, "gpt-6.1-sol");

// Cost: cached input at the cached rate, web searches at $0.01, unknown model → null.
// gpt-6.1-terra: 10,000 in (4,000 cached) and 1,000 out, 2 searches = 0.006 + 0.0002 + 0.005 + 0.02.
assert.equal(aiCostUsd("gpt-6.1-terra", { inputTokens: 10_000, cachedInputTokens: 4_000, outputTokens: 1_000, webSearchCalls: 2 })!.toFixed(6), "0.031200");
assert.equal(aiCostUsd("gpt-5-mini", {}), 0);
assert.equal(aiCostUsd("mock", { inputTokens: 5 }), null);
console.log("✓ model tiers, overrides, cost");
